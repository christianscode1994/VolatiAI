def depin_route(intel):
    return {
        "type": "depin_route",
        "helium": intel["depin"]["helium"]["coverage_score"] > 0.75,
        "render": intel["depin"]["render"]["gpu_capacity_score"] > 0.65,
        "akash": intel["depin"]["akash"]["compute_availability_score"] > 0.80,
    }
