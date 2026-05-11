"""Convert paths to human-readable instructions and visualizations."""
import matplotlib.pyplot as plt
from config import CELL_SIZE


class InstructionGenerator:
    """Generate navigation instructions and map visualizations."""

    def __init__(self, grid_manager):
        self.grid_mgr = grid_manager

    def path_to_instructions(self, path):
        """Convert path nodes to step-by-step instructions."""
        if not path:
            return "No path found."

        instructions = []
        last_floor, last_r, last_c = path[0]
        current_dir = None
        dist = 0

        def add_instruction(direction, distance):
            if distance > 0:
                instructions.append(f"Move {direction} {distance * CELL_SIZE:.1f}m.")

        for i in range(1, len(path)):
            f, r, c = path[i]

            # Floor change
            if f != last_floor:
                add_instruction(current_dir, dist)
                instructions.append(f"Take stairs from floor {last_floor + 3} to floor {f + 3}.")
                current_dir = None
                dist = 0
                last_floor = f

            # Direction calculation
            dr = r - last_r
            dc = c - last_c
            if abs(dr) > abs(dc):
                direction = "down" if dr > 0 else "up"
                step = abs(dr)
            else:
                direction = "right" if dc > 0 else "left"
                step = abs(dc)

            if direction == current_dir:
                dist += step
            else:
                add_instruction(current_dir, dist)
                current_dir = direction
                dist = step

            last_r, last_c = r, c

        add_instruction(current_dir, dist)
        instructions.append("You have arrived at your destination room.")
        return ". ".join(instructions)

    def plot_path(self, path, output_path="static_path.png"):
        """Plot navigation path on floor maps."""
        fig, axs = plt.subplots(1, 2, figsize=(18, 6))
        grids = [self.grid_mgr.grid_0, self.grid_mgr.grid_1]

        for i, grid in enumerate(grids):
            axs[i].imshow(grid, cmap="gray_r", origin="upper")

            # Plot stairs
            stairs_pos = np.where(grid == 2)
            axs[i].scatter(stairs_pos[1], stairs_pos[0], s=40, label="Stairs")

            # Plot path
            xs = [p[2] for p in path if p[0] == i]
            ys = [p[1] for p in path if p[0] == i]
            if xs and ys:
                axs[i].plot(xs, ys, linewidth=3, label="Path")
                axs[i].scatter(xs[0], ys[0], s=80, label="Start")
                axs[i].scatter(xs[-1], ys[-1], s=80, label="End")

            axs[i].set_title(f"Floor {i + 3}")
            axs[i].legend()

        plt.savefig(output_path)
        plt.close()
        return output_path
