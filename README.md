# JapanLearn

App movil offline para aprender japones desde cero: kana, kanji y vocabulario
con repeticion espaciada (FSRS) y practica de escritura a mano.

Todo es local. No hay backend ni sincronizacion.

## Comandos

| Comando | Que hace |
|---|---|
| `npm start` | Arranca el dev server (Expo Go) |
| `npm run build:db` | Regenera `assets/db/japanese.db` desde las fuentes |
| `npm run verify:db` | 18 invariantes sobre el contenido generado |
| `npm run test:smoke` | Compila todo el SQL de `src/` y simula una sesion completa |
| `npm run gen:webseed` | Regenera la semilla de contenido para revisar la UI en web |

Para la fuente japonesa: `tools/pipeline/src/font.sh` (necesita `tools/pipeline/.venv`,
creado con `python3 -m venv .venv && .venv/bin/pip install fonttools brotli`).

## Probar en el telefono por cable

El firewall del equipo bloquea el puerto 8081, asi que por wifi no conecta.
Por USB si:

```
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" host.exp.exponent
```

Para que funcione por wifi sin cable, una vez: `sudo ufw allow 8081/tcp`

## Como esta montado

**Dos archivos SQLite.** `japanese.db` es el contenido (solo lectura, se puede
reemplazar entero) y `progress.db` el progreso del usuario (nunca se sobrescribe,
se monta con ATTACH). El progreso referencia el contenido por ids deterministas
(codepoint Unicode / `ent_seq` de JMdict) porque **SQLite no valida foreign keys
entre bases adjuntas**.

**El contenido NO va en WAL.** Solo el progreso. Un sidecar `-wal` huerfano sobre
un `.db` recien copiado por `forceOverwrite` corrompe la base, y el fallo solo
aparece en la segunda actualizacion de contenido.

**El glifo de estudio se dibuja desde los trazos de KanjiVG, no como texto.**
Elimina el riesgo de que Android resuelva el kanji con la variante china y ensene
la forma equivocada. La fuente subseteada cubre el resto del texto.

**La pantalla raiz es la tarjeta.** Sin menus ni "empezar sesion": cada respuesta
se persiste sola, asi que salir tras 3 tarjetas vale igual que hacer 80.

## El orden del curriculum

**Manda el nivel de estudio, no la frecuencia.** El campo `<freq>` de KANJIDIC es
un ranking de PRENSA. Ordenar por el a secas sacaba 政 (politica) de kanji nº 17
y 議 (deliberacion) de nº 25, mientras 食 (comer) caia en el 328 y 何 (que) en el
340: se aprendia a leer editoriales antes que a pedir agua. Ahora ordena el nivel
JLPT, con el curso escolar para los 557 kanji que no tienen nivel, y la
frecuencia solo desempata dentro de cada nivel. Ver `curriculum.mjs:studyRank`.

**El katakana va intercalado, no en bloque.** Los 208 items de kana completos
delante retrasaban el primer kanji hasta la posicion 209, ~17 dias de simbolos
sueltos. Ahora el hiragana entero va primero (104), el kanji empieza en la 105 y
el katakana entra 1 de cada 3 items. El vocabulario en kana se desbloquea al
acabar el gojuon de hiragana (46), no al acabar los dos silabarios.

**Un componente solo se ensena si tiene nombre curado en espanol.** KANJIDIC solo
trae nombres de radical en ingles y de diccionario: una tarjeta "¿que significa
彑?" con respuesta "pig's head radical variant (no. 58)" no ensena nada. Se
nombran a mano los 83 que aparecen en 8 o mas kanji (`data/component-names.es.json`)
y los otros 228 se quedan fuera del curriculum, aunque siguen apareciendo en la
ficha del kanji. Sin esta regla eran 246 de 256 componentes en ingles.

**La escritura es opcional y va apagada de serie.** Cada kanji graduado genera
ademas una tarjeta de escritura: al final del curriculum son ~2.800 tarjetas mas.
Reconocer e interpretar no necesita saber trazar. Se enciende en Avances, y al
apagarlo las tarjetas existentes se aparcan con `suspended = 3` en vez de
borrarse.

**Los desbloqueos tienen presupuesto.** Las tarjetas de escritura y lectura no
nacen de `introduceNext`, asi que no pasan por `plan()`. Se insertaban con
`due = ahora` y `state = 0`, es decir como vencidas y sin tope: al terminar el
hiragana se volcaban de golpe todas las palabras que esperaban al ultimo kana.
Ahora `unlockDerivedCards` no crea mas material nuevo del que ya esta esperando
sin empezar (`maxLearning`).

## Fuentes de datos

KANJIDIC2 y JMdict (CC BY-SA, EDRDG) y KanjiVG (CC BY-SA). Las licencias obligan
a atribuir: la pantalla de creditos es `src/app/credits.tsx`.
