# Sub-Project 3: Living Fantasy Wildlife & Context-Aware Jump Anticipation

## Goals
1. **Natural Pre-Jump Knee-Bend Anticipation (Standing vs. Moving):**
   - Standing jumps (`spd < 1.5 u/s`) execute a crisp `70ms` symmetric two-legged deep knee crouch before exploding upward.
   - Walking, running, and sprinting jumps (`spd >= 1.5 u/s`) execute a snappy `50ms` **asymmetric single-leg plant-and-drive takeoff** (lead foot plants with deep knee bend while trailing knee & opposite arm pump forward-up) while preserving 100% of horizontal run/sprint momentum.
   - Coyote-time ledge saves and shallow-water shore hops still launch instantaneously (`0ms` prep) for rock-solid platforming responsiveness.

2. **Tactile Feathers, Fur & Scales (Procedural PBR + Sculpted Silhouettes):**
   - Add two fast, seamless `256×256` procedural PBR sets in `textures.js` (`feather` overlapping plumage vanes/rachis and `scales` overlapping staggered diamond reptile/fish scales) and sharpen `fur` into directional clumped fur strands — keeping full `Textures.init()` boot under `250ms`.
   - Upgrade all animal body plans in `models.js` with shared geometries and cached per-species linearized PBR materials:
     - **Birds (`makeBird`, `makeWish`):** Layered wing covert & fanned primary **feather blades**, layered breast/shoulder plumage tufts, 5-vane fanned tail feathers, cheek tufts, and 2-segment jointed legs with 3 forward toes + hallux grounded at `y = 0`.
     - **Furry Quads (`makeQuad`):** Flexing `bodyGroup` spine pivot, sculpted cheek ruffs, layered chest ruff/mane, shoulder & haunch fur tufts, ear-tip tufts, whiskers on feline/fox builds, and a multi-tuft plumed tail.
     - **Scaled Lizards (`makeLizard`):** Normal-mapped overlapping diamond scales, interlocking beveled **dorsal scute plates** along spine & tail, sculpted brow ridges, layered neck frill scales, clawed splayed feet, and flexing spine/tail rig for lateral S-curve undulation.
     - **Aquatic & Bugs (`makeFish`, `makeEel`, `makeBug`):** Shimmering `scales` maps on fish/eels and glossy chitin sheen + articulated tripod-gait legs on bugs.

3. **True Grounded Stepping, Trotting & Bounding Gaits (Zero Foot Skating):**
   - Replace constant-rate `hopT` gliding in `game.js` with **actual horizontal displacement-synced gait phase** (`gaitPhase += movedDist / strideLen`).
   - Drive distinct planted-stance vs. lifted-swing cycles in `Models.animateCritter`:
     - **Quads:** Blend continuously from 4-beat stepping walk -> diagonal trot -> leaping feline/canine bound (with spine pitch, airborne suspension arc, and dust puffs on fast bounds).
     - **Birds:** Alternating grounded stride/strut with avian head-bob when walking, transitioning into fluttering winged hops/swoops when fleeing or fighting.
     - **Lizards:** Synced S-curve lateral spine/head/tail wave driving alternating diagonal sprawled strides.
     - **Bugs:** Alternating 3+3 insect tripod stepping.
   - Smoothly align grounded land critters' pitch & roll to the sampled `terrainNormalAt(x, z)`.
