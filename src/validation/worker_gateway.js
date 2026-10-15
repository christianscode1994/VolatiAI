import Ajv from "ajv";

export class WorkerGateway {

    constructor(schema) {

        const ajv = new Ajv({
            allErrors: true,
            strict: false
        });

        this.validate =
            ajv.compile(schema);
    }

    process(worker) {

        const cleaned =
            this.autocorrect(
                this.sanitize(worker)
            );

        const valid =
            this.validate(cleaned);

        return {
            valid,
            data: cleaned,
            errors:
                this.validate.errors || []
        };
    }

    sanitize(obj) {

        return JSON.parse(
            JSON.stringify(
                obj,
                (_, value) => {

                    if (
                        typeof value === "number" &&
                        !Number.isFinite(value)
                    ) {
                        return null;
                    }

                    return value;
                }
            )
        );
    }

    autocorrect(worker = {}) {

        return {

            schema_version:
                worker.schema_version ??
                "1.0",

            sector:
                worker.sector ??
                "unknown",

            worker:
                worker.worker ??
                "unknown",

            timestamp:
                worker.timestamp ??
                new Date().toISOString(),

            quality:
                this.clamp(
                    worker.quality
                ),

            confidence:
                this.clamp(
                    worker.confidence
                ),

            sector_score:
                this.clamp(
                    worker.sector_score
                ),

            status:
                this.fixStatus(
                    worker.status
                ),

            sources:
                this.fixSources(
                    worker.sources
                ),

            summary:
                this.fixSummary(
                    worker.summary
                ),

            metrics:
                worker.metrics ?? {},

            signals:
                this.fixSignals(
                    worker.signals
                )
        };
    }

    clamp(value) {

        const n =
            Number(value);

        if (
            Number.isNaN(n)
        ) {
            return 0;
        }

        return Math.max(
            0,
            Math.min(100, n)
        );
    }

    fixStatus(status) {

        return [
            "ok",
            "partial",
            "error"
        ].includes(status)
            ? status
            : "partial";
    }

    fixSources(s = {}) {

        return {

            considered:
                parseInt(
                    s.considered ?? 0
                ),

            used:
                parseInt(
                    s.used ?? 0
                ),

            failed:
                parseInt(
                    s.failed ?? 0
                )
        };
    }

    fixSummary(s = {}) {

        return {

            bullish:
                parseInt(
                    s.bullish ?? 0
                ),

            bearish:
                parseInt(
                    s.bearish ?? 0
                ),

            neutral:
                parseInt(
                    s.neutral ?? 0
                )
        };
    }

    fixSignals(signals) {

        if (
            !Array.isArray(signals)
        ) {
            return [];
        }

        return signals.map(
            signal => ({

                id:
                    String(
                        signal?.id ??
                        crypto.randomUUID()
                    ),

                type:
                    String(
                        signal?.type ??
                        "unknown"
                    ),

                title:
                    String(
                        signal?.title ??
                        ""
                    ),

                source:
                    String(
                        signal?.source ??
                        "unknown"
                    ),

                url:
                    String(
                        signal?.url ??
                        ""
                    ),

                score:
                    this.clamp(
                        signal?.score
                    ),

                sentiment:
                    Math.max(
                        -1,
                        Math.min(
                            1,
                            Number(
                                signal?.sentiment ?? 0
                            )
                        )
                    ),

                importance:
                    this.clamp(
                        signal?.importance
                    )
            })
        );
    }
}
