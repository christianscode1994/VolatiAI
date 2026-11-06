export function verifyPrediction(prediction, actual) {

    const expected = prediction.value;
    const observed = actual.value;

    const error = Math.abs(expected - observed);

    const accuracy = Math.max(
        0,
        1 - error
    );

    return {
        predictionId: prediction.id,
        accuracy,
        verified: accuracy >= 0.8,
        timestamp: Date.now()
    };
}
