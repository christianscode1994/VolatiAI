from evidence.query_graph import EvidenceQuery

class PathSearch:

    def __init__(self):
        self.graph = EvidenceQuery().graph

    def find_paths(self, start, end):

        results = []

        def dfs(node, path):

            if node == end:
                results.append(path[:])
                return

            for edge in self.graph["edges"]:

                if edge["source"] == node:

                    target = edge["target"]

                    if target not in path:
                        dfs(
                            target,
                            path + [target]
                        )

        dfs(start, [start])

        return results
