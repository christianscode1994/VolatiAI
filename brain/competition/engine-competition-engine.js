export function compete(outputs = []) {

    const ranked = outputs
        .map(output => ({
            ...output,
            finalScore:
                output.confidence *
                output.reputation
        }))
        .sort(
            (a, b) =>
                b.finalScore -
                a.finalScore
        );

    return ranked;
}
