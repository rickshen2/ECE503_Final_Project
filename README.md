# Final Project
## ECE503 Programming Finance
### Qing Ou, Rick Shen
### Fall 2024

```                                          
  ____  _         _____              _           _    ___ 
 / ___|(_)_ __ __|_   _| __ __ _  __| | ___     / \  |_ _|
 \___ \| | '_ ` _ \| || '__/ _` |/ _` |/ _ \   / _ \  | | 
  ___) | | | | | | | || | | (_| | (_| |  __/_ / ___ \ | | 
 |____/|_|_| |_| |_|_||_|  \__,_|\__,_|\___(_)_/   \_\___|
                                                         
```

## Overview
Our stock simulator, SimTrade.ai, aims to help its clients hone their trading skills by creating a virtual stock trading environment. 
* Clients are presented with virtual $100,000 cash to start. 
* Cash accrues interest on a 2% rate.
* The date is set to 2024-09-03 so that they can have 3 months to test their strategies. 
* The clients can specify how many days they want to simulate since start. 
* All 4 numbers above can be adjusted on the server program config.js as global variables. 
  
  ```
    interest_rate: 0.02,        \\ interest rate
    simStartDay: '2024-09-03',  \\ simulation start date
    initialSimCash: 100000      \\ initial virtual cash
    numDaysToSimulate = 55;     \\ number of days to simulate since the trades start
  ```

For stock trading, the simulator offers virtual stock exchange experience/ operations to its clients:
1. "Manual" trading: combines *market order* and *limit order*, i.e., clients can execute transactions at the day they want and at the price from the data base.
   ```
   \\ userID, ticker,  number of shares, date where trading takes place, portfolio type
   tradeStock(1, 'GOOGL', 100, simStartDay, "manual"); 
   ```
   
2. "Strategic" trading: *trend-following* strategy allows the clients to specify the stock ticker symbol, the number of shares to trade, and the time period when the strategy will be active. Once set, the program will monitor the price movement daily. If buy/ sell signal is triggered, the program will execute the trade orders automatically.
    ```
    \\ userID, ticker, current date, monitoring start date, monitoring end date, number of shares, action at the end of period
    trendFollowing(1, 'TSLA', new_Date, start_Date, end_Date, 100, 'hold');
    ```
3. "Algorithmic" trading: *index tracking* requires the client to specify an *analysis period* (see explaination below). The program then collects the NASDAQ-100 stock price history from that time up to the simulated trading start date (2024-09-03). With the help of a "stock analysis" class object, it calculates the daily log returns, whose probability distribution is approximately stationary. The program then performs *Principal Component Analysis* - an unsupervised machine learning algorithm, to come up with 20 stocks out of the NASDAQ-100 which best explain the variance of the whole 100 stocks. After that, a simple *Linear Regression* is performed to fit those 20 stocks on the NASDAQ-100 index. The names and weights of the selected stocks will be returned. Finally, based on the user-defined portfolio value, the program allocates the shares individually and executes the trading actions. The goal is to select a subset of the NASDAQ-100 which would represent the index itself.
    ``` 
    \\ userID, analysis start date, analysis end date, amount of cash to invest, portfolio creation date
    PCA_analysis(userID, analysis_start_date, analysis_end_date,  totalValue, trade_date) 
 
    ```
## run_simulations()
This is the master function to compare the 3 aforementioned portfolios over the simulation period. 
### Key Concepts
* *Analysis period*: this is the time window for analyzing performance of stock(s) which is any time period before *simStartDay*.  
* *Simulation period*: this is the period of time *numDaysToSimulate* days after *simStartDay*, which the app monitors portfolio performance. For trend following strategy, the app actively trades during this period according to the rules defined in the function.
* *Portfolio value*: this is the approximate value of each of the 3 portfolio. The actual amount will be determined by the shares of individual composing stock as the simulation only allows integer number of shares. 
  ```
  const singlePortVal = 30000;
  ```
The master simulation then allocates the three portfolios: 
| Type          | Stock Selection      | Shares Allocation     | Allow Short Sale | Investing|
|---------------|---------------|---------------|---------------|---------------|
| Manual| Top 20 by Sharpe ratio| Equal weight| No | Hold|
| Strategic| Random| Equal weight| No | Active|
| Algorithmic | PCA | Linear regression | Yes | Hold|

Once execute the *main()* function, which contains *run_simulation()* and with the demo lines remarked, 
the program allocates the portfolio on *simStartDay* and loops through *numDaysToSimulate*. At the end of every day, the program records the portfolio values to the database. At the end of the simulation, the program writes the portfolio history to '.\portfolio_history.csv'.

### Input 
*log_returns.csv* contains the daily log returns of a list of stocks for PCA analysis.

### Output
*portfolio_history.csv* contains the daily portfolio values during the simulation period.

*stock_data_2024-12-05_205936.sql* contains the database entries made during the simulation, which can be used to save about 15 minutes of simulation time for front-end program review. 


## Folder Structure
Project folder 
```
├── input 
│     ├── stock_prices.csv --> time series daily stock price data of NASDAQ-100 stocks 
│     └── log_returns.csv --> processed log return from the daily prices
├── output
│     ├── stock_data_2024-12-05_205936.sql --> previous simulation results 
│     └── portfolio_history.csv --> portfolio value movement history
├── public        --> front end files for result display
├── spec 
│     └── server.spec.js --> jasmine test file 
├── config.js     --> list of NASDAQ-100 stock symbols, simulation parameters
├── utility.js    --> all supporing class objects and functions 
├── db_setup.sql  --> to setup/ initialize MySQL database with tables
├── PCA_LinReg.py --> contains functions to perform machine learning for algorithmic trading
├── server.js     --> back end program to start a local server for result display
├── package.json
├── package-lock.json
└── README.md     --> this file 
```

## Dependencies

  yahoo-finance2, mysql, fs, csv-parser, path, express, cors, express-session

For Python:\
  pandas, numpy, sklearn, scipy, json, sys

## Instructions
1. Open utility.js, navigate to near the bottom, locate 
   
   ```
   async function run_simulations()
   ```
    change the parameters if necessary. 

2. Once satisfied, run the program by 
   ```
   node utility.js
   ```
   this will take a while depending on how many years the algorithmic trading needs to look back for analysis and how many days the portfolios will be monitored. 

3. Once finished, the program will write to ./output/portfolio_history.csv.
4. To view the results, start the server by 
   ```
   node server.js
   ```
   wait for the console reads Server running at http://localhost:3000.
5. Use a browser, go to 
   ```
   http://localhost:3000
   ```
   login with credential:\
   username: rds260\
   password: ECE503
  
6. The client side program uses the *PortfolioAnalysis* class to analyze the portfolio value history stored in '.\output\portfolio_history.csv'. Click through the tabs to view the performance of portfolios.
7. Research tab is wrapped around the *StockAnalysis* class. Use the input boxes to define the ticker, start and end period to see its statistics. 




