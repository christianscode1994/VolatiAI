import {
    generateWorlds
} from "../multiworld/multiworld-simulation-engine.js";

import {
    compete
} from "../competition/engine-competition-engine.js";

import {
    explain
} from "../explainability/explainability-engine.js";

import {
    createMission
} from "../missions/autonomous-research-engine.js";

export async function think(
    graph,
    engines
) {

    const worlds =
        generateWorlds(graph);

    const outputs = [];

    for (const world of worlds) {

        for (const engine of engines) {

            outputs.push(
                await engine.run(world)
            );
        }
    }

    const ranked =
        compete(outputs);

    const winner =
        ranked[0];

    const explanation =
        explain(winner);

    const missions =
        createMission(graph);

    return {

        worlds,

        winner,

        explanation,

        missions,

        ranked
    };
}
