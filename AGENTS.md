<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Sauvegarde Git automatique (Cursor)

Ce dépôt définit un hook **projet** (`.cursor/hooks.json`) : après chaque outil qui modifie des fichiers (`Write`, `StrReplace`, `ApplyPatch`, etc.), un script tente un commit `wip: sauvegarde auto (…)`.

- **Désactiver** : variable d’environnement `PHR_SKIP_AUTO_GIT_COMMIT=1` pour le processus Cursor (ou retirer / commenter l’entrée dans `hooks.json`).
- **Relancer Cursor** si le hook ne se déclenche pas après la première création des fichiers.
- Le script utilise `git add -- <path>` quand le chemin est fourni par l’outil ; sinon `git add -u` (fichiers déjà suivis seulement).
