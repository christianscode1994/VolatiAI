export function createMission(
    graph
) {

    const candidates =
        graph.nodes.filter(
            n => n.uncertainty > 0.6
        );

    return candidates.map(node => ({

        id:
            `mission_${node.id}`,

        target:
            node.id,

        priority:
            node.uncertainty,

        objective:
            `Reduce uncertainty for ${node.id}`

    }));
}
