# Polices des images de partage

Rendu serveur par `@resvg/resvg-js` (TTF uniquement, sans axes variables). Toutes sous licence SIL Open Font
License 1.1 (`OFL.txt`), téléchargées depuis github.com/google/fonts (`ofl/<famille>/`).

| Fichier | Rôle |
|---|---|
| `Belleza-Regular.ttf` | marque et type sur le cadran, chiffres du verso |
| `IMFeENrm28P.ttf`, `IMFeENit28P.ttf` | IM Fell English : légende, lieu et année |
| `PinyonScript-Regular.ttf` | signature de technique |
| `BigShoulders-Black.ttf` | titres d'affichage (graisse 900) |
| `JetBrainsMono-Medium.ttf` | étiquettes et chiffres |
| `InstrumentSans-Medium.ttf` | texte courant |

Les trois dernières sont des instances statiques des polices variables, faites avec fontTools 4.67 :

```bash
fonttools varLib.instancer "BigShoulders[opsz,wght].ttf" wght=900 opsz=drop -o BigShoulders-Black.ttf
fonttools varLib.instancer "JetBrainsMono[wght].ttf" wght=500 -o JetBrainsMono-Medium.ttf
fonttools varLib.instancer "InstrumentSans[wdth,wght].ttf" wght=500 wdth=100 -o InstrumentSans-Medium.ttf
```
