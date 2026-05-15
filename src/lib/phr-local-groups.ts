import type { PublicHandPost } from "@/lib/phr-public-feed";

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

function generateInviteCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]!;
  }
  return code;
}

function normalizeInviteCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function validateInviteCodeFormat(code: string): void {
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

const STORAGE_KEY = "phr-local-review-groups-v1";
export const LOCAL_GROUP_ID_PREFIX = "local-";

type LocalGroupRecord = ReviewGroup & { inviteCode: string };

type LocalGroupsStore = {
  groups: Record<string, LocalGroupRecord>;
  invites: Record<string, string>;
  membershipsByUid: Record<string, ReviewGroupMembership[]>;
  membersByGroup: Record<string, ReviewGroupMember[]>;
};

function emptyStore(): LocalGroupsStore {
  return { groups: {}, invites: {}, membershipsByUid: {}, membersByGroup: {} };
}

function readStore(): LocalGroupsStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as LocalGroupsStore;
    return {
      groups: parsed.groups ?? {},
      invites: parsed.invites ?? {},
      membershipsByUid: parsed.membershipsByUid ?? {},
      membersByGroup: parsed.membersByGroup ?? {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: LocalGroupsStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("phr-local-groups-changed"));
}

export function isLocalGroupsEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_PHR_LOCAL_GROUPS;
  return flag === "1" || flag === "true";
}

export function isLocalGroupId(groupId: string): boolean {
  return groupId.startsWith(LOCAL_GROUP_ID_PREFIX);
}

function localUid(uid: string | null | undefined): string {
  return uid?.trim() || "local-dev-user";
}

export async function createLocalReviewGroup(input: {
  ownerUid: string;
  ownerPseudo: string;
  name: string;
  description?: string;
  inviteCode?: string;
}): Promise<{ groupId: string; inviteCode: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Nom du groupe requis.");

  const description = input.description?.trim() ?? "";
  const pseudo = input.ownerPseudo.trim() || "Joueur";
  const uid = localUid(input.ownerUid);
  const inviteCode = input.inviteCode?.trim()
    ? normalizeInviteCode(input.inviteCode)
    : generateInviteCode();
  validateInviteCodeFormat(inviteCode);

  const store = readStore();
  if (store.invites[inviteCode] && store.groups[store.invites[inviteCode]!]?.id) {
    throw new Error("Ce code d’invitation est déjà pris. Choisis-en un autre.");
  }

  const groupId = `${LOCAL_GROUP_ID_PREFIX}${crypto.randomUUID()}`;
  const now = Date.now();
  const group: LocalGroupRecord = {
    id: groupId,
    name,
    description,
    ownerUid: uid,
    memberCount: 1,
    createdAtMs: now,
    inviteCode,
  };

  store.groups[groupId] = group;
  store.invites[inviteCode] = groupId;
  store.membersByGroup[groupId] = [
    { uid, pseudo, role: "owner", joinedAtMs: now },
  ];

  const membership: ReviewGroupMembership = {
    groupId,
    name,
    description,
    role: "owner",
    joinedAtMs: now,
  };
  const existing = store.membershipsByUid[uid] ?? [];
  store.membershipsByUid[uid] = [membership, ...existing.filter((m) => m.groupId !== groupId)];

  writeStore(store);
  return { groupId, inviteCode };
}

export async function joinLocalReviewGroupByInviteCode(input: {
  uid: string;
  pseudo: string;
  inviteCode: string;
}): Promise<string> {
  const code = normalizeInviteCode(input.inviteCode);
  validateInviteCodeFormat(code);
  const store = readStore();
  const groupId = store.invites[code];
  if (!groupId || !store.groups[groupId]) {
    throw new Error("Code d’invitation introuvable.");
  }

  const group = store.groups[groupId]!;
  const uid = localUid(input.uid);
  const pseudo = input.pseudo.trim() || "Joueur";
  const members = store.membersByGroup[groupId] ?? [];
  if (members.some((m) => m.uid === uid)) return groupId;

  const now = Date.now();
  members.push({ uid, pseudo, role: "member", joinedAtMs: now });
  store.membersByGroup[groupId] = members;
  group.memberCount = members.length;

  const membership: ReviewGroupMembership = {
    groupId,
    name: group.name,
    description: group.description,
    role: "member",
    joinedAtMs: now,
  };
  const existing = store.membershipsByUid[uid] ?? [];
  store.membershipsByUid[uid] = [membership, ...existing.filter((m) => m.groupId !== groupId)];

  writeStore(store);
  return groupId;
}

export function getLocalUserReviewGroups(uid: string | null): ReviewGroupMembership[] {
  const store = readStore();
  return [...(store.membershipsByUid[localUid(uid)] ?? [])].sort(
    (a, b) => b.joinedAtMs - a.joinedAtMs,
  );
}

export function getLocalReviewGroup(groupId: string): ReviewGroup | null {
  const g = readStore().groups[groupId];
  if (!g) return null;
  const { inviteCode: _invite, ...group } = g;
  return group;
}

export function getLocalGroupMembers(groupId: string): ReviewGroupMember[] {
  const members = readStore().membersByGroup[groupId] ?? [];
  return [...members].sort((a, b) => {
    if (a.role === "owner") return -1;
    if (b.role === "owner") return 1;
    return a.joinedAtMs - b.joinedAtMs;
  });
}

export function getLocalGroupInviteCode(groupId: string): string | null {
  const g = readStore().groups[groupId];
  return g?.inviteCode ?? null;
}

export function getLocalGroupSpots(_groupId: string): PublicHandPost[] {
  return [];
}

/** Crée un groupe « Groupe test » s’il n’existe pas encore pour cet utilisateur. */
export async function ensureLocalTestGroup(input: {
  ownerUid: string;
  ownerPseudo: string;
}): Promise<{ groupId: string; inviteCode: string; created: boolean }> {
  const uid = localUid(input.ownerUid);
  const existing = getLocalUserReviewGroups(uid);
  const test = existing.find((g) => g.name === "Groupe test");
  if (test) {
    const inviteCode = getLocalGroupInviteCode(test.groupId) ?? "TESTGRP";
    return { groupId: test.groupId, inviteCode, created: false };
  }
  const { groupId, inviteCode } = await createLocalReviewGroup({
    ownerUid: uid,
    ownerPseudo: input.ownerPseudo,
    name: "Groupe test",
    description: "Groupe local pour tester SpotLab (sans Firestore).",
    inviteCode: "TESTGRP",
  });
  return { groupId, inviteCode, created: true };
}
