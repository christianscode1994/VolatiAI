import {
    loadWorker
} from "../validation/load_worker.js";

export async function aggregate(
    sectorUrls
) {

    const sectors = [];

    for (const url of sectorUrls) {

        const result =
            await loadWorker(url);

        if (
            !result.valid
        ) {
            console.error(
                "Worker rejected:",
                url
            );

            continue;
        }

        sectors.push(
            result.data
        );
    }

    return sectors;
}
