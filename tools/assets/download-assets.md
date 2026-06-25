# Fire Simulator Asset Integration & Tiled Map Guide

The MBFD Tactical Scene Simulator utilizes high-quality, lightweight tactical assets and programmatic SVG vector layers. By default, the simulator renders highly visible vector fire apparatus and fireground elements dynamically on our React-Konva canvas. This ensures zero load-time lag on smartboards and tablets.

To integrate additional third-party graphic assets or load custom Tiled maps, follow the structures and guidelines below.

## 1. Third-Party Graphic Asset Directories

If you wish to supplement the vector vehicles with graphical sprites, download the following CC0-licensed packs from **Kenney (kenney.nl)** and place them in the following directories:

*   **Kenney Racing Pack** (Top-down fire engines / ambulances):
    *   Place in: `public/assets/kenney/vehicles/`
*   **Kenney Tiny Town** (Top-down residential and commercial building tiles):
    *   Place in: `public/assets/kenney/tiles/`
*   **Kenney Minimap Pack** (Tactical fire icons / hydrants / map arrows):
    *   Place in: `public/assets/kenney/minimap/`
*   **Kenney Smoke Particles** (Smoke & Fire VFX particle sequences):
    *   Place in: `public/assets/kenney/particles/`

## 2. Tiled Level Editor Level Integration

We recommend using the free, open-source editor **Tiled** to create complex tactical maps.

### Map Setup in Tiled
1.  **Map Properties**: Orientation must be **Orthogonal**, and format should be exported as **JSON**.
2.  **Layer Hierarchy**: Set up your layer names exactly as follows:
    *   `background`: Grass, dirt, parcels, textures.
    *   `roads`: Concrete, lane markings, driveways.
    *   `sidewalks`: Concrete paths alongside structures.
    *   `buildings`: Static blocks representing residences/commercial properties (ensure these are set as objects with an `id` and a `label`).
    *   `hydrants`: Point positions representing water sources.
    *   `hazards`: Power lines, blockages, down branches.
    *   `labels`: Alpha Side labels (A/B/C/D) and address text.

### Custom Map Properties
For custom building objects in Tiled, attach these custom properties under the Tiled properties inspector:
*   `selectable`: `boolean` (True)
*   `occupancy`: `string` (e.g., "Single-Family Residential")
*   `constructionType`: `string` (e.g., "Type V (Wood-Frame)")
*   `floors`: `number` (e.g., `2`)
*   `id`: `string` (unique alphanumeric ID)
*   `label`: `string` (displayed on the command board)

Export your final Tiled map to `public/assets/tactical/city_block.json` to load it inside our map importer.
