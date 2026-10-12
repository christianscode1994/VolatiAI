export function generateWorlds(
    graph,
    count = 5
) {

    const worlds = [];

    for (let i = 0; i < count; i++) {

        worlds.push({

            id: `world_${i}`,

            assumptions: [
                `variation_${i}`
            ],

            confidence:
                Math.random(),

            nodes:
                structuredClone(
                    graph.nodes || []
                )
        });
    }

    return worlds;
}
