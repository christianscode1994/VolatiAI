class BeliefEngine:

    @staticmethod
    def confidence(
        surprise,
        persistence,
        corroboration,
        contradiction,
    ):
        score = (
            surprise +
            persistence +
            corroboration -
            contradiction
        )

        return max(
            0.0,
            min(1.0, score / 100.0)
        )
