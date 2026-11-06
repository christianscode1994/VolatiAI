export function qualityScore(
    worker
) {

    let score = 100;

    if (
        worker.status !== "ok"
    ) {
        score -= 20;
    }

    score -=
        worker.sources.failed || 0;

    if (
        worker.signals.length === 0
    ) {
        score -= 10;
    }

    return Math.max(
        0,
        score
    );
}
