import pandas as pd
import numpy as np
from sklearn.decomposition import PCA
from scipy.optimize import minimize
import json
import sys

def PCA_LinReg(csvPath='./input/log_returns.csv'):
    try:
        # Step 1: Read the CSV file
        data = pd.read_csv(csvPath)
        
        # Step 2: Preprocess data
        stock_names = list(data.columns[1:-1])  # Exclude 'Date' (1st col) and 'y' (last col)
        y_train = data.iloc[1:, -1].astype(float).values  # Exclude 1st row, use last column for y
        log_returns = data.iloc[1:, 1:-1].astype(float).values  # Exclude 1st row, remove 'Date' and 'y'

        # Step 3: Perform PCA on n x d data
        pca = PCA()
        pca.fit(log_returns)

        # Get the loadings for the first principal component
        loadings = pca.components_[0]
        abs_loadings = np.abs(loadings)  # Use absolute values for sorting

        # Sort stock names based on the absolute values of loadings
        sorted_indices = np.argsort(abs_loadings)[::-1]  # Descending order
        top_20_indices = sorted_indices[:20]  # First 20 features
        top_20_features = [stock_names[i] for i in top_20_indices]

        # Extract the top 20 features for constrained linear regression
        X_train = log_returns[:, top_20_indices]

        # Step 4: Define the optimization problem for linear regression with constraint
        # Constraint that weights sum to 1
        def constraint(weights):
            return np.sum(weights) - 1
        
        def objective_function(weights, X, y):
            # Predict using weighted sum directly
            y_pred = np.dot(X, weights)
            return np.sum((y_pred - y) ** 2)        
        
        n = 5
        y_train = np.where(y_train > 0, y_train * n, y_train)
        
        
        # Initial weights (equal allocation)
        initial_weights = np.ones(X_train.shape[1]) / X_train.shape[1]

        # # Bounds: weights can be any real number (modify if additional constraints exist)
        # bounds = [(None, None) for _ in range(top_20_data.shape[1])]

        # Solve the optimization problem
        result = minimize(
            objective_function, 
            initial_weights, 
            args=(X_train, y_train),
            constraints={'type': 'eq', 'fun': constraint}
            # bounds=bounds, 
            # method='SLSQP'
        )

        # Get optimized weights
        optimized_weights = result.x

        # Step 5: Prepare result as a dictionary
        result_dict = {
            "features": top_20_features,
            "weights": optimized_weights.tolist()
        }
        # print(result_dict.weights)
        # Return result to JS
        print(json.dumps(result_dict))
    
    except Exception as e:
        error_message = {"error": str(e)}
        print(json.dumps(error_message))

# Check if script is called directly and read csvPath from arguments
if __name__ == "__main__":
    csvPath = sys.argv[1] if len(sys.argv) > 1 else './input/log_returns.csv'
    PCA_LinReg(csvPath)
