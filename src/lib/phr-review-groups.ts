import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";

import { getFirebaseDb } from "./firebase";
import { sanitizeForFirestore } from "./phr-firebase-sync";
import { parseFeedDocument, type PublicHandPost } from "./phr-public-feed";

export type ReviewGroupRole = "owner" | "member";

export type ReviewGroup = {
  id: string;
  name: string;
  description: string;
  ownerUid: string;
  memberCount: number;
  createdAtMs: number;
};

export type ReviewGroupMembership = {
  groupId: string;
  name: string;
  description: string;
  role: ReviewGroupRole;
  joinedAtMs: number;
};

export type ReviewGroupMember = {
  uid: string;
  pseudo: string;
  role: ReviewGroupRole;
  joinedAtMs: number;
};

const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function groupsCacheKey(uid: string): string {
  return `phr-review-groups:${uid}`;
}

function readGroupsCache(uid: string): ReviewGroupMembership[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(groupsCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (g): g is ReviewGroupMembership =>
        typeof g === "object" &&
        g !== null &&
        typeof (g as ReviewGroupMembership).groupId === "string" &&
        typeof (g as ReviewGroupMembership).name === "string",
    );
  } catch {
    return null;
  }
}

function writeGroupsCache(uid: string, groups: ReviewGroupMembership[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(groupsCacheKey(uid), JSON.stringify(groups));
  } catch {
    /* quota / mode privé */
  }
}

export function generateInviteCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]!;
  }
  return code;
}

/** Normalise saisie utilisateur (majuscules, caractères autorisés uniquement). */
export function normalizeInviteCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function validateInviteCodeFormat(code: string): void {
  if (code.length < 6) {
    throw new Error("Le code doit contenir au moins 6 caractères (lettres et chiffres).");
  }
  if (code.length > 12) {
    throw new Error("Le code ne peut pas dépasser 12 caractères.");
  }
  for (const ch of code) {
    if (!INVITE_CHARS.includes(ch)) {
      throw new Error("Utilise uniquement des lettres et chiffres (sans I, O, 0, 1).");
    }
  }
}

async function assertInviteCodeAvailable(code: string, exceptGroupId?: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const snap = await getDoc(doc(db, "groupInvites", code));
  if (!snap.exists()) return;

  const data = snap.data() as Record<string, unknown>;
  const existingGroupId = typeof data.groupId === "string" ? data.groupId : "";
  if (exceptGroupId && existingGroupId === exceptGroupId) return;

  throw new Error("Ce code d’invitation est déjà pris. Choisis-en un autre.");
}

function resolveInviteCode(raw?: string): string {
  const normalized = raw?.trim() ? normalizeInviteCode(raw) : generateInviteCode();
  validateInviteCodeFormat(normalized);
  return normalized;
}

function groupsCol() {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");
  return collection(db, "reviewGroups");
}

function membersCol(groupId: string) {
  return collection(getFirebaseDb()!, "reviewGroups", groupId, "members");
}

function userMembershipsCol(uid: string) {
  return collection(getFirebaseDb()!, "users", uid, "groupMemberships");
}

function parseGroupDoc(id: string, data: Record<string, unknown>): ReviewGroup {
  const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
  return {
    id,
    name: typeof data.name === "string" ? data.name.trim() : "Groupe",
    description: typeof data.description === "string" ? data.description.trim() : "",
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    memberCount:
      typeof data.memberCount === "number" && Number.isFinite(data.memberCount)
        ? Math.max(1, Math.round(data.memberCount))
        : 1,
    createdAtMs:
      typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : Date.now(),
  };
}

export async function createReviewGroup(input: {
  ownerUid: string;
  ownerPseudo: string;
  name: string;
  description?: string;
  /** Code personnalisé ; généré aléatoirement si absent. */
  inviteCode?: string;
}): Promise<{ groupId: string; inviteCode: string }> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const name = input.name.trim();
  if (!name) throw new Error("Nom du groupe requis.");

  const description = input.description?.trim() ?? "";
  const pseudo = input.ownerPseudo.trim() || "Joueur";
  const inviteCode = resolveInviteCode(input.inviteCode);
  await assertInviteCodeAvailable(inviteCode);

  const groupRef = doc(groupsCol());

  // Le document groupe doit exister avant le batch membre / invitation :
  // les règles Firestore lisent l’état « avant » le batch (get/exists ne voient pas les écritures du même batch).
  await setDoc(
    groupRef,
    sanitizeForFirestore({
      name,
      description,
      ownerUid: input.ownerUid,
      memberCount: 1,
      createdAt: serverTimestamp(),
    }),
  );

  const batch = writeBatch(db);

  batch.set(doc(membersCol(groupRef.id), input.ownerUid), {
    uid: input.ownerUid,
    pseudo,
    role: "owner",
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(userMembershipsCol(input.ownerUid), groupRef.id), {
    groupId: groupRef.id,
    name,
    description,
    role: "owner",
    joinedAt: serverTimestamp(),
  });

  batch.set(doc(db, "groupInvites", inviteCode), {
    groupId: groupRef.id,
    createdBy: input.ownerUid,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
  return { groupId: groupRef.id, inviteCode };
}

export async function joinReviewGroupByInviteCode(input: {
  uid: string;
  pseudo: string;
  inviteCode: string;
}): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const code = input.inviteCode.trim().toUpperCase();
  if (code.length < 6) throw new Error("Code d’invitation invalide.");

  const inviteRef = doc(db, "groupInvites", code);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error("Code d’invitation introuvable.");

  const invite = inviteSnap.data() as Record<string, unknown>;
  const groupId = typeof invite.groupId === "string" ? invite.groupId : "";
  if (!groupId) throw new Error("Invitation invalide.");

  const groupRef = doc(db, "reviewGroups", groupId);
  const memberRef = doc(membersCol(groupId), input.uid);
  const membershipRef = doc(userMembershipsCol(input.uid), groupId);

  await runTransaction(db, async (tx) => {
    const [groupSnap, memberSnap] = await Promise.all([tx.get(groupRef), tx.get(memberRef)]);
    if (!groupSnap.exists()) throw new Error("Groupe introuvable.");
    if (memberSnap.exists()) return;

    const groupData = groupSnap.data() as Record<string, unknown>;
    const name = typeof groupData.name === "string" ? groupData.name : "Groupe";
    const description =
      typeof groupData.description === "string" ? groupData.description : "";
    const memberCount =
      typeof groupData.memberCount === "number" && Number.isFinite(groupData.memberCount)
        ? groupData.memberCount
        : 1;

    const pseudo = input.pseudo.trim() || "Joueur";
    tx.set(memberRef, {
      uid: input.uid,
      pseudo,
      role: "member",
      joinedAt: serverTimestamp(),
    });
    tx.set(membershipRef, {
      groupId,
      name,
      description,
      role: "member",
      joinedAt: serverTimestamp(),
    });
    tx.update(groupRef, { memberCount: memberCount + 1 });
  });

  return groupId;
}

export function subscribeUserReviewGroups(
  uid: string | null,
  onData: (groups: ReviewGroupMembership[]) => void,
): Unsubscribe {
  if (!uid) {
    queueMicrotask(() => onData([]));
    return () => {};
  }
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData([]));
    return () => {};
  }

  const q = query(userMembershipsCol(uid), orderBy("joinedAt", "desc"));
  return onSnapshot(q, (snap) => {
    const groups = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const joinedAt = data.joinedAt as { toMillis?: () => number } | undefined;
      return {
        groupId: d.id,
        name: typeof data.name === "string" ? data.name : "Groupe",
        description: typeof data.description === "string" ? data.description : "",
        role: data.role === "owner" ? "owner" : "member",
        joinedAtMs:
          typeof joinedAt?.toMillis === "function" ? joinedAt.toMillis() : Date.now(),
      } satisfies ReviewGroupMembership;
    });
    onData(groups);
  });
}

export function subscribeReviewGroup(
  groupId: string,
  onData: (group: ReviewGroup | null) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData(null));
    return () => {};
  }
  const ref = doc(db, "reviewGroups", groupId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    onData(parseGroupDoc(snap.id, snap.data() as Record<string, unknown>));
  });
}

export function subscribeGroupMembers(
  groupId: string,
  onData: (members: ReviewGroupMember[]) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData([]));
    return () => {};
  }
  return onSnapshot(membersCol(groupId), (snap) => {
    const members = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const joinedAt = data.joinedAt as { toMillis?: () => number } | undefined;
      return {
        uid: d.id,
        pseudo: typeof data.pseudo === "string" ? data.pseudo : "Joueur",
        role: data.role === "owner" ? "owner" : "member",
        joinedAtMs:
          typeof joinedAt?.toMillis === "function" ? joinedAt.toMillis() : Date.now(),
      } satisfies ReviewGroupMember;
    });
    members.sort((a, b) => {
      if (a.role === "owner") return -1;
      if (b.role === "owner") return 1;
      return a.joinedAtMs - b.joinedAtMs;
    });
    onData(members);
  });
}

/** Fil privé du groupe : spots avec visibility=group et groupId. */
export function subscribeGroupSpots(
  groupId: string,
  onData: (posts: PublicHandPost[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) {
    queueMicrotask(() => onData([]));
    return () => {};
  }

  const q = query(
    collection(db, "spots"),
    where("visibility", "==", "group"),
    where("groupId", "==", groupId),
    orderBy("createdAt", "desc"),
    limit(40),
  );

  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) =>
          parseFeedDocument(d.id, d.data() as Record<string, unknown>, "spots"),
        ),
      );
    },
    (err) => onError?.(err instanceof Error ? err : new Error("Erreur fil groupe")),
  );
}

export async function getGroupInviteCode(groupId: string, requesterUid: string): Promise<string | null> {
  const db = getFirebaseDb();
  if (!db) return null;

  const memberSnap = await getDoc(doc(membersCol(groupId), requesterUid));
  if (!memberSnap.exists()) return null;

  const { getDocs } = await import("firebase/firestore");
  const snap = await getDocs(
    query(collection(db, "groupInvites"), where("groupId", "==", groupId), limit(1)),
  );
  if (snap.empty) return null;
  return snap.docs[0]!.id;
}

/** Propriétaire : définit ou remplace le code d’invitation du groupe. */
export async function setGroupInviteCode(
  groupId: string,
  ownerUid: string,
  rawCode: string,
): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore non initialisé");

  const groupSnap = await getDoc(doc(db, "reviewGroups", groupId));
  if (!groupSnap.exists()) throw new Error("Groupe introuvable.");
  if ((groupSnap.data() as Record<string, unknown>).ownerUid !== ownerUid) {
    throw new Error("Seul le propriétaire peut modifier le code.");
  }

  const code = resolveInviteCode(rawCode);
  const previous = await getGroupInviteCode(groupId, ownerUid);
  if (previous === code) return code;

  await assertInviteCodeAvailable(code, groupId);

  if (previous) {
    await deleteDoc(doc(db, "groupInvites", previous));
  }

  await setDoc(doc(db, "groupInvites", code), {
    groupId,
    createdBy: ownerUid,
    createdAt: serverTimestamp(),
  });

  return code;
}

export async function ensureGroupInviteCode(groupId: string, ownerUid: string): Promise<string> {
  const existing = await getGroupInviteCode(groupId, ownerUid);
  if (existing) return existing;
  return setGroupInviteCode(groupId, ownerUid, generateInviteCode());
}
