from flask import Flask, request, jsonify, render_template
import numpy as np
import math
from qiskit_optimization import QuadraticProgram
from qiskit_optimization.algorithms import MinimumEigenOptimizer
from qiskit_algorithms import QAOA
from qiskit_aer import AerSimulator,Aer
from qiskit_algorithms.optimizers import COBYLA
from qiskit.primitives import BackendSampler
from docplex.mp.model import Model
from qiskit_optimization.translators import from_docplex_mp
from qiskit_algorithms.utils import algorithm_globals



app = Flask(__name__)

def calculate_distance(coord1, coord2):
    """Computes the Haversine distance between two coordinates."""
    R = 6371  # Earth radius in km
    lat1, lon1 = coord1[1], coord1[0]
    lat2, lon2 = coord2[1], coord2[0]

    d_lat = (lat2 - lat1)* (math.pi / 180)
    d_lon = (lon2 - lon1)* (math.pi / 180)

    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(lat1* (math.pi / 180)) * math.cos(lat2* (math.pi / 180)) *
         math.sin(d_lon / 2) ** 2)

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c

def build_cost_matrix(locations):
    """Constructs a cost matrix using Haversine distances."""
    n = len(locations)
    cost_matrix = np.zeros((n, n))

    for i in range(n):
        for j in range(i + 1, n):
            distance = calculate_distance(locations[i], locations[j])
            cost_matrix[i][j] = distance
            cost_matrix[j][i] = distance  # Symmetric

    return cost_matrix

def solve_tsp_qaoa(locations):
    """Solves the TSP problem using QAOA while keeping the first location fixed."""
    if len(locations) <= 2:
        return locations  # No optimization needed for 1 or 2 locations
    
    first_location = locations[0]  # Keep the first location fixed
    remaining_locations = locations[1:]  # Optimize only the remaining locations

    # Build the cost matrix for remaining locations
    cost_matrix = build_cost_matrix(remaining_locations)
    n = len(remaining_locations)

    # Define the optimization problem
    tsp_problem = QuadraticProgram()

    # Store variable names
    variable_names = {}

    # Add binary variables for each node (i, j)
    for i in range(n):
        for j in range(n):
            if i != j:  # Prevent self-loops
                var_name = f"x_{i}_{j}"
                tsp_problem.binary_var(name=var_name)
                variable_names[(i, j)] = var_name  # Store for reference

    # Objective: Minimize travel cost
    objective_terms = {variable_names[(i, j)]: float(cost_matrix[i][j]) for i in range(n) for j in range(n) if i != j}
    tsp_problem.minimize(linear=objective_terms)

    # Constraint: Each node must be visited exactly once
    for i in range(n):
        tsp_problem.linear_constraint(
            linear={variable_names[(i, j)]: 1 for j in range(n) if i != j},
            sense="==",
            rhs=1,
            name=f"visit_from_{i}"
        )
        tsp_problem.linear_constraint(
            linear={variable_names[(j, i)]: 1 for j in range(n) if i != j},
            sense="==",
            rhs=1,
            name=f"visit_to_{i}"
        )

    # Solve using QAOA with AerSimulator
    backend = Aer.get_backend('qasm_simulator')
    optimizer = MinimumEigenOptimizer(QAOA(sampler=BackendSampler(backend=backend), optimizer=COBYLA()))

    # Solve the problem
    result = optimizer.solve(tsp_problem)
    solution = result.x

    # Extract optimized route
    optimized_route = [first_location]  # Start with the first location
    edges = [(i, j) for i in range(n) for j in range(n) if i != j and solution[list(variable_names.keys()).index((i, j))] == 1]

    # Construct a valid sequence
    visited = set()
    current_location = 0  # Start from the first location implicitly

    while len(visited) < n:
        visited.add(current_location)
        for (i, j) in edges:
            if i == current_location and j not in visited:
                optimized_route.append(remaining_locations[j])
                current_location = j
                break

    # Ensure last node is added if missed
    if len(optimized_route) < len(locations):
        for loc in remaining_locations:
            if loc not in optimized_route:
                optimized_route.append(loc)

    return optimized_route



@app.route('/')
def index():
    return render_template('index.html')

@app.route('/optimize', methods=['POST'])
def optimize_route():
    try:
        data = request.get_json()
        if not data or "waypoints" not in data:
            return jsonify({"error": "Invalid request format"}), 400

        waypoints = data["waypoints"]
        if not isinstance(waypoints, list) or len(waypoints) < 2:
            return jsonify({"error": "Waypoints must be a list with at least two locations"}), 400

        optimized_route = solve_tsp_qaoa(waypoints)

        return jsonify({"optimized_route": optimized_route})

    except Exception as e:
        print(f"Server Error: {str(e)}")  # Print full error to terminal
        return jsonify({"error": "Internal Server Error"}), 500

if __name__ == '__main__':
    app.run(debug=True)