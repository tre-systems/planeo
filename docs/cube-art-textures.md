# Cube Art Textures

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

Each interactive cube in the 3D environment displays a piece of art on one randomly selected face.

## Feature Overview

- **Textures:** Each cube has an artwork textured onto one of its six faces; the remaining five faces keep their solid color.
- **Art Source:** The artworks come from The Metropolitan Museum of Art's Open Access collection. The images are served locally from the `/public/art/` directory to ensure reliability and avoid CORS issues.
- **Implementation:**
  - The `SyncedRigidBox` component in `src/app/components/Box.tsx` takes a `box` prop and selects its art internally — on mount it picks a stable random URL from `artImageUrls` (the list defined in `Box.tsx`).
  - It uses the `useTexture` hook from `@react-three/drei` to asynchronously load the chosen image from its local URL (e.g., `/art/image_1.jpg`).
  - The loaded texture is applied as a `meshStandardMaterial` to one face of the `Box` geometry. The other faces use the box's color.
- **Current Artworks:** The images served from `/public/art/` are:
  - `image_1.jpg`
  - `image_2.jpg`
  - `image_3.jpg`
  - `image_4.jpg`

## Technical Details

Each `SyncedRigidBox` chooses a random face to carry the art by picking a random material slot (`material-${randomIndex}` for a random index `0–5`) when it mounts. The `Box` component from `@react-three/drei` allows specifying a different material per face: the art texture is applied to the chosen slot, and the box's color is applied to the other five.

## Future Enhancements

- **Expanded Collection:** The list of artworks could be expanded, or a more dynamic system for fetching and caching a wider variety of images could be implemented (though local serving is currently preferred for stability).
- **User Interaction:** Allow users to select or upload their own images for the cube faces.
- **Texture Controls:** Provide options for texture mapping, such as scaling or offsetting the image on the cube face.
