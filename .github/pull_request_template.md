**Versió:** `X.Y.Z` (patch | minor) · o `sense canvi` si el PR només toca `docs/`, `.github/`, `.agents/`, `AGENTS.md` o `README.md`.

<!-- Tot PR que canvia el comportament de l'app puja la versió: package.json, package-lock.json, el badge del README i una entrada nova a CHANGELOG.md. patch per a fix/chore/refactor/test, minor per a feat. Vegeu docs/agents/pull-requests.md. -->

## 1. Problema

<!-- Què fallava o què faltava: primer per a qui fa servir l'app, després la causa tècnica. `Closes #N` (sempre en anglès: GitHub no reconeix «Tanca») si hi ha issue; si no, digues d'on ha sortit. -->

## 2. Solució

<!-- Què canvia i per què. Marca explícitament qualsevol canvi de comportament, migració de base de dades, variable d'entorn nova, o decisió d'arquitectura que hagi d'anar a docs/adr/. -->

## 3. Tests

<!-- Tests afegits o executats, i si s'ha comprovat que fallen amb el codi antic. Resultat de `npm run check`, `npm run lint` i `npm test`. -->

## 4. Guia de verificació en real

<!-- Passos concrets: ruta, acció i **Esperat:** resultat. Si algun pas modifica dades, fes-lo sobre una còpia de la base de dades. -->

- [ ]
- [ ] Si el PR puja la versió: l'app shell i la pantalla d'inici de sessió mostren `vX.Y.Z`.
