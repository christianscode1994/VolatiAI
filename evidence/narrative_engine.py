from evidence.pipeline import result

def narrative():

    confidence = result["belief"]["confidence"]

    supports = [
        edge["source"]
        for edge in result["supports"]
    ]

    contradictions = [
        edge["source"]
        for edge in result["contradictions"]
    ]

    text = (
        f"Manufacturing confidence is "
        f"{round(confidence * 100,1)}%. "
        f"Supporting evidence comes from "
        f"{', '.join(supports)}."
    )

    if contradictions:
        text += (
            f" Contradicting evidence comes from "
            f"{', '.join(contradictions)}."
        )

    return text

if __name__ == "__main__":
    print(narrative())
