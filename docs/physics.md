# Physics System

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

This document outlines the physics system in Planeo, which uses `react-three-rapier` for physics interactions within the 3D environment.

## Cubes

The shared environment contains a fixed set of physics cubes, rendered by `ServerDrivenBoxes` in `src/app/components/Box.tsx`. These cubes:

- Are a fixed size (`15 × 15 × 15`).
- Spawn at deterministic initial positions laid out along the X axis (`[i * 15 - (N - 1) * 7.5, 5, -20]`), where the count comes from `NUMBER_OF_BOXES`.
- Each take a color cycled from a fixed 12-entry palette.
- Are dynamic `RigidBody` instances with `cuboid` colliders, so they fall under gravity and interact with each other, the ground, and the eyes.

## Eyes

User and AI-agent representations (eyeballs) are also part of the physics simulation:

- Each eye is a `kinematicPosition` `RigidBody`, meaning its movement is driven by the application (user input or AI) but it can push and interact with the dynamic cubes.
- Each eye has a `BallCollider` (radius `EYE_RADIUS`) to represent its physical shape.

### Implementation Details

- **Physics Engine:** The simulation is powered by `react-three-rapier`, a wrapper around the Rapier physics engine for React Three Fiber.
- **Components:**
  - `Box.tsx`: Exports `ServerDrivenBoxes`, which reads cube state from the `boxStore` and renders one `SyncedRigidBox` per cube. Each `SyncedRigidBox` is a dynamic `RigidBody` with a `cuboid` collider.
  - `Eye.tsx` and `Eyes.tsx`: These components manage the creation and behavior of the eye representations. Each eye is a `kinematicPosition` `RigidBody` with a `BallCollider`. Their positions and rotations are updated kinematically in the `useFrame` loop within `Eyes.tsx` (via `setNextKinematicTranslation` / `setNextKinematicRotation`).
  - `Scene.tsx`: The main scene wraps `CanvasContent`, `Eyes`, and `ServerDrivenBoxes` in a `<Physics>` component from `react-three-rapier`, establishing the physics world.
- **Ground Plane:** A static (`type="fixed"`) `RigidBody` with a `CuboidCollider` acts as the ground, preventing the cubes from falling indefinitely.

### Future Enhancements

- More complex object interactions.
- User interaction with physics objects (e.g., directly grabbing or throwing cubes).
- Performance optimizations for a larger number of physics bodies.
