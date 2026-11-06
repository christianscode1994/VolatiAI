import schema from "../schemas/worker.schema.json" assert { type: "json" };

import {
    WorkerGateway
} from "./worker_gateway.js";

const gateway =
    new WorkerGateway(schema);

export async function loadWorker(
    url
) {

    try {

        const response =
            await fetch(url);

        const json =
            await response.json();

        return gateway.process(
            json
        );

    } catch (err) {

        return {

            valid: false,

            data: null,

            errors: [
                err.message
            ]
        };
    }
}
