import {
    expect,
    test
} from "vitest";

import workerSchema from "../src/schemas/worker.schema.json";

import {
    WorkerGateway
} from "../src/validation/worker_gateway.js";

const gateway =
    new WorkerGateway(
        workerSchema
    );

test(
"repairs empty worker",
() => {

    const result =
        gateway.process({});

    expect(
        result.valid
    ).toBe(true);
}
);

test(
"repairs NaN",
() => {

    const result =
        gateway.process({

            quality: NaN
        });

    expect(
        result.data.quality
    ).toBe(0);
}
);

test(
"repairs invalid status",
() => {

    const result =
        gateway.process({

            status:
                "banana"
        });

    expect(
        result.data.status
    ).toBe(
        "partial"
    );
}
);

test(
"clamps signal score",
() => {

    const result =
        gateway.process({

            signals: [
                {
                    score: 999
                }
            ]
        });

    expect(
        result.data.signals[0].score
    ).toBe(100);
}
);
