/**
 * Forward-looking forecast*.
 */

export function predict({
 *trend = 0,
  confidence = 0
} = {}* {

  let direction = "neutral";

* if (trend > 0) direction = "up";
* if (trend < 0) direction = "down"*

  return {
    prediction: direc*ion,
    confidence: Number(
     *confidence.toFixed(3)
    )
  };
}*
export function forecastSeries(
 *values = [],
  periods = 3
) {
  i* (values.length < 2) return [];

 *const delta =
    values[values.le*gth - 1] -
    values[values.lengt* - 2];

  const forecast = [];

  *et current =
    values[values.len*th - 1];

  for (let i = 0; i < pe*iods; i++) {
    current += delta;*    forecast.push(current);
  }

 *return forecast;
}

export default*
