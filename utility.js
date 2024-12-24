const yahooFinance = require('yahoo-finance2').default;
const mysql = require('mysql');
const fs = require('fs');
const csvParser = require('csv-parser');
const { interest_rate, simStartDay, lstIXIC, initialSimCash, numDaysToSimulate } = require('./config');
const { spawn } = require('child_process');
const path = require('path');

// // MySQL Database Connection
const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',  
  password: 'client_password',  
  database: 'stock_data'
});

db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL Database.');
});


// class object to analyzer stock(s) 
// writeReturnsToCSV is used by PCA linear regression for algorithmic trading
class StockAnalysis {
  constructor(tickers, startDate, endDate) {
    this.dates = [];
    this.tickers = tickers;
    this.startDate = startDate;
    this.endDate = endDate;
    this.dailyPrices = [];
    this.dailyDiffs = [];
    this.logReturns = [];
    this.totalLogReturn = [];
    this.dailyReturns = [];
  }

  async fetchData() {
    try {
      for (const ticker of this.tickers) {
        const result = await yahooFinance.historical(ticker, {
          period1: this.startDate,
          period2: this.endDate,
          interval: '1d',
        });

        result.forEach((entry) => {
          const date = entry.date.toISOString().split('T')[0]; // Format date as YYYY-MM-DD

          if (!this.dates.includes(date)) {
            this.dates.push(date); // Collect unique dates
          }

          if (!this.dailyPrices[ticker]) {
            this.dailyPrices[ticker] = {};
          }
          this.dailyPrices[ticker][date] = entry.close;
        });
      }

    } catch (error) {
      throw new Error(`Error fetching data: ${error.message}`);
    }
  }

  getDailyDifference() {
    for (const ticker of this.tickers) {
      const prices = this.dates.map((date) => this.dailyPrices[ticker]?.[date] || null);
  
      this.dailyDiffs[ticker] = {}; // Initialize an empty object for the ticker's differences
  
      for (let i = 1; i < prices.length; i++) {
        if (prices[i] !== null && prices[i - 1] !== null) {
          const date = this.dates[i];
          this.dailyDiffs[ticker][date] = prices[i] - prices[i - 1];
        }
      }
    }
  }  

  getReturns() {
    for (const ticker of this.tickers) {
      const prices = this.dates.map((date) => this.dailyPrices[ticker]?.[date] || null);
  
      this.dailyReturns[ticker] = {};
      this.logReturns[ticker] = {};
  
      for (let i = 1; i < prices.length; i++) {
        if (prices[i] !== null && prices[i - 1] !== null && prices[i-1] !== 0) {
          const dailyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
          const logReturn = Math.log(prices[i] / prices[i - 1]);
  
          const date = this.dates[i];
          this.dailyReturns[ticker][date] = dailyReturn;
          this.logReturns[ticker][date] = logReturn;
          this.totalLogReturn[ticker] =  Object.values(this.logReturns[ticker]).reduce((sum, val) => sum + val, 0);
          // Debug log
          // console.log(`Ticker: ${ticker}, Date: ${date}, Daily Return: ${dailyReturn}, Log Return: ${logReturn}`);
        } else {
          const dailyReturn = 0;
          const logReturn = 0;        
        }        
      }
    }
  }
  

  // Get cumulative log return (last log return - first log return)
  getTotalReturn() {
    const totalReturns = {};
  
    for (const ticker of this.tickers) {
      const prices = this.dates.map((date) => this.dailyPrices[ticker]?.[date]);
  
      if (prices[0] !== null && prices[prices.length - 1] !== null) {
        const startPrice = prices[0];
        const endPrice = prices[prices.length - 1];
  
        totalReturns[ticker] = (endPrice / startPrice) - 1;
      } else {
        totalReturns[ticker] = NaN; // Handle missing data
      }
    }
  
    return totalReturns;
  }
  
  
  getMean() {
    const allPrices = [];
    for (const ticker of this.tickers) {
      for (const date of this.dates) {
        const price = this.dailyPrices[ticker]?.[date];
        if (price !== undefined) allPrices.push(price);
      }
    }
    return allPrices.length > 0
      ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length
      : NaN;
  }
  
  getStdDev() {
    const allPrices = [];
    for (const ticker of this.tickers) {
      for (const date of this.dates) {
        const price = this.dailyPrices[ticker]?.[date];
        if (price !== undefined) allPrices.push(price);
      }
    }
  
    if (allPrices.length <= 1) return NaN;
  
    const mean = this.getMean();
    const variance =
      allPrices.reduce((sum, price) => sum + (price - mean) ** 2, 0) /
      (allPrices.length - 1);
  
    return Math.sqrt(variance);
  }
  
  getMin() {
    const allPrices = [];
    for (const ticker of this.tickers) {
      for (const date of this.dates) {
        const price = this.dailyPrices[ticker]?.[date];
        if (price !== undefined) allPrices.push(price);
      }
    }
    return allPrices.length > 0 ? Math.min(...allPrices) : NaN;
  }
  
  getMax() {
    const allPrices = [];
    for (const ticker of this.tickers) {
      for (const date of this.dates) {
        const price = this.dailyPrices[ticker]?.[date];
        if (price !== undefined) allPrices.push(price);
      }
    }
    return allPrices.length > 0 ? Math.max(...allPrices) : NaN;
  }  

  getSharpeRatio() {
    const sharpeRatios = {};
    const rf_rate = interest_rate / 365;
  
    // Ensure returns are properly calculated and available
    this.getReturns();
  
    for (const ticker of this.tickers) {
      const returns = Object.values(this.dailyReturns[ticker] || []); // Convert to array for length and calculations
      if (returns.length === 0) {
        console.log(`No returns data for ${ticker}`);
        sharpeRatios[ticker] = NaN;
        continue;
      }
  
      // Calculate mean return
      const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  
      // Calculate variance and standard deviation
      const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);
  
      if (stdDev === 0) {
        sharpeRatios[ticker] = NaN; // Avoid division by zero
      } else {
        // Calculate Sharpe ratio
        sharpeRatios[ticker] = (meanReturn - rf_rate) * Math.sqrt(252) / stdDev;
      }
    }
  
    return sharpeRatios;
  }

  writeReturnsToCSV(outputFileName) {
    const header = ['Date', ...this.tickers];
    const rows = [header];

    for (const date of this.dates) {
      const row = [date];
      this.tickers.forEach((ticker) => {
        row.push(this.logReturns[ticker]?.[date]?.toFixed(6) || ''); // Fill missing with empty
      });
      rows.push(row);
    }

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    fs.writeFileSync(outputFileName, csvContent, 'utf8');
    console.log(`Data written to ${outputFileName}`);
  }

  async analyze() {
    await this.fetchData();
    this.getDailyDifference();
    this.getReturns();
    this.getSharpeRatio();

    return {
      mean: this.getMean(),
      standardDeviation: this.getStdDev(),
      min: this.getMin(),
      max: this.getMax(),      
      sharpeRatio: this.getSharpeRatio(),
      dailyPrices: this.dailyPrices,
      totalReturn: this.getTotalReturn(),
      dailyDiffs: this.dailyDiffs,
      dailyReturns: this.dailyReturns,
      dailyLogReturns: this.logReturns,
    };
  }
}

// class object to analyzer portfolio
// read data from csv 
class PortfolioAnalysis {
  constructor(csvPath, columnName) {
    this.csvPath = csvPath;
    this.columnName = columnName; // The name of the column to analyze
    this.date = [];
    this.name = columnName;
    this.dailyVal = [];
    this.dailyChange = [];
    this.percChange = [];
    this.ytdChange = null;
    this.ytdPercChange = null;
    this.modDate = null;
    this.loadData();
  }

  // Load data from the CSV file and process it
  loadData() {
    const filePath = path.resolve(this.csvPath);

    // Read and parse the CSV file
    const csvData = fs.readFileSync(filePath, 'utf-8');
    const lines = csvData.split('\n').filter(line => line.trim() !== '');

    // Extract headers and rows
    const headers = lines[0].split(',').map(header => header.trim());
    const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim()));

    // Find the index of the column by name
    const columnIndex = headers.indexOf(this.columnName);
    if (columnIndex === -1) {
      throw new Error(`Column "${this.columnName}" not found in the CSV file.`);
    }

    // Process the data
    rows.forEach(row => {
      const date = row[0]; // First column is the date
      const value = parseFloat(row[columnIndex]);

      if (!isNaN(value)) {
        this.date.push(date);
        this.dailyVal.push(value);
      }
    });

    // Calculate changes and percentage changes
    this.calculateChanges();
  }

  // Calculate daily change, percentage change, YTD change, and YTD percentage change
  calculateChanges() {
    for (let i = 0; i < this.dailyVal.length; i++) {
      if (i === 0) {
        this.dailyChange.push(0); // No change for the first day
        this.percChange.push(0); // No percentage change for the first day
      } else {
        const change = this.dailyVal[i] - this.dailyVal[i - 1];
        const percChange = (change / this.dailyVal[i - 1]) * 100;

        this.dailyChange.push(change);
        this.percChange.push(percChange);
      }
    }

    // Calculate YTD change and YTD percentage change
    const firstVal = this.dailyVal[0];
    const lastVal = this.dailyVal[this.dailyVal.length - 1];

    this.ytdChange = lastVal - firstVal;
    this.ytdPercChange = ((lastVal - firstVal) / firstVal) * 100;
    this.modDate = this.date[this.date.length - 1];
  }

  // Display the calculated data
  displayAnalysis(bDisplayDaily = false) {
    console.log(`Portfolio Analysis for ${this.name} on date ${this.modDate}:`);
    console.log(`YTD Change: ${this.ytdChange.toFixed(2)}`);
    console.log(`YTD Percentage Change: ${this.ytdPercChange.toFixed(2)}%`);
    
    if (bDisplayDaily){
    console.log('Daily Data:');
    for (let i = 0; i < this.date.length; i++) {
      console.log(
        `${this.date[i]} - Value: ${this.dailyVal[i].toFixed(2)}, ` +
        `Change: ${this.dailyChange[i].toFixed(2)}, ` +
        `% Change: ${this.percChange[i].toFixed(2)}%`
      );
    }};
  }
}

// const portfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Cash+Strategic');
// portfolio.displayAnalysis();

// get stock prices from CSV
// getStockFromCSV('AAPL','2024-10-02', './input/stock_prices.csv')
async function getStockFromCSV(symbols, date, csvPath) {
  return new Promise((resolve, reject) => {
    const stockPrices = {};
    
    // Open the CSV file and parse it
    fs.createReadStream(csvPath)
      .pipe(csvParser())
      .on('data', (row) => {
        // Assume the first column is the date and the first row contains symbols
        const rowDate = row['Date']; // Assuming the first column is 'Date'
        
        if (rowDate === date) {
          // For each symbol, check if it matches the given symbols
          for (let i = 1; i < Object.keys(row).length - 1; i++) {
            const symbol = Object.keys(row)[i];
            if (symbols.includes(symbol)) {
              // Store the stock price for the symbol and date
              stockPrices[symbol] = parseFloat(row[symbol]);
            }
          }
        }
      })
      .on('end', () => {
        // Once all rows are processed, resolve the promise with the stock prices
        resolve(stockPrices);
      })
      .on('error', (err) => {
        // Reject the promise in case of an error
        reject(err);
      });
  });
}

// Fetch Stock Data from Yahoo Finance
async function getStockData(symbol, today) {
    try {
      const data = await yahooFinance.historical(symbol, {
        period1: '2019-01-01',
        period2: today,
        interval: '1d',
      });
      console.log('updated stock price(s).')
      return data;
    } catch (error) {
      console.error('Error fetching stock data:', error);
      throw new Error('Failed to fetch stock data');
    }
  }

// Trade stock type = 'manual/ strategic/ algorithmic'
// quantity > 0 --> buy; quantity < 0 --> sell
async function tradeStock(userID, ticker, quantity, date, type) {
  if (quantity === 0) {
    throw new Error("Quantity must not be zero.");
  }

  const connection = db;

  try {
    // Begin transaction
    await new Promise((resolve, reject) =>
      connection.beginTransaction((err) => (err ? reject(err) : resolve()))
    );

    const isBuying = quantity > 0;

    // Fetch the stock price for the given ticker and date
    console.log(`Fetching stock price for ${ticker} on ${date}...`);
    const priceRows = await new Promise((resolve, reject) =>
      connection.query(
        'SELECT Price FROM stock_prices WHERE Ticker = ? AND Date = ?',
        [ticker, date],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );
    console.log('Price rows retrieved:', priceRows);

    if (priceRows.length === 0) {
      console.log(`No stock price found for ${ticker} on ${date}. Updating stock prices.`);
      await getStockData(ticker, date);

      const updatedPriceRows = await new Promise((resolve, reject) =>
        connection.query(
          'SELECT Price FROM stock_prices WHERE Ticker = ? AND Date = ?',
          [ticker, date],
          (err, results) => (err ? reject(err) : resolve(results))
        )
      );

      console.log('Updated price rows:', updatedPriceRows);

      if (updatedPriceRows.length === 0) {
        throw new Error(`Unable to retrieve price for ${ticker} on ${date} after update.`);
      }

      priceRows.push(updatedPriceRows[0]);
    }

    const price = priceRows[0].Price;
    const totalCostOrRevenue = price * Math.abs(quantity);
    // console.log(`Price for ${ticker} on ${date}: ${price}`);
    // console.log(`Total cost/revenue for ${ticker}: ${totalCostOrRevenue}`);

    // Check if the user has a portfolio of the specified type
    // console.log(`Fetching portfolio for user ${userID} and type ${type}...`);
    const portfolioRows = await new Promise((resolve, reject) =>
      connection.query(
        'SELECT PortfolioID, TotalValue FROM Portfolios WHERE UserID = ? AND PortfolioType = ?',
        [userID, type],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );
    console.log('Portfolio rows retrieved:', portfolioRows);

    let portfolioID;
    let portfolioValue;

    if (portfolioRows.length === 0) {
      // Initialize the portfolio if it doesn't exist
      console.log(`Initializing new portfolio for type ${type}...`);
      const result = await new Promise((resolve, reject) =>
        connection.query(
          'INSERT INTO Portfolios (UserID, TotalValue, PortfolioType, modDate) VALUES (?, ?, ?, ?)',
          [userID, 0, type, date],
          (err, results) => (err ? reject(err) : resolve(results))
        )
      );
      console.log('Portfolio INSERT result:', result);

      if (result && result.insertId) {
        portfolioID = result.insertId;
        portfolioValue = 0;
      } else {
        throw new Error("Failed to initialize new portfolio. insertId is missing.");
      }
    } else {
      portfolioID = portfolioRows[0].PortfolioID;
      portfolioValue = portfolioRows[0].TotalValue;
    }

    // Fetch the user's holdings for the specified stock
    console.log(`Fetching holdings for ticker ${ticker}...`);
    const holdingRows = await new Promise((resolve, reject) =>
      connection.query(
        'SELECT HoldingID, Quantity FROM Portfolio_Holdings WHERE PortfolioID = ? AND Ticker = ?',
        [portfolioID, ticker],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );
    console.log('Holding rows retrieved:', holdingRows);

    let currentQuantity = holdingRows.length > 0 ? holdingRows[0].Quantity : 0;

    if (!isBuying) {
      // Validate sell constraints
      if (type !== 'algorithmic' && currentQuantity < Math.abs(quantity)) {
        throw new Error(`Cannot sell more shares than owned for portfolio type '${type}'.`);
      }
      currentQuantity -= Math.abs(quantity); // Deduct quantity for selling
    } else {
      currentQuantity += quantity; // Add quantity for buying
    }

    // Update or insert the holding
    if (holdingRows.length > 0) {
      if (currentQuantity === 0) {
        console.log(`Deleting holding for ticker ${ticker}...`);
        await new Promise((resolve, reject) =>
          connection.query(
            'DELETE FROM Portfolio_Holdings WHERE HoldingID = ?',
            [holdingRows[0].HoldingID],
            (err) => (err ? reject(err) : resolve())
          )
        );
      } else {
        console.log(`Updating holding for ticker ${ticker}...`);
        await new Promise((resolve, reject) =>
          connection.query(
            'UPDATE Portfolio_Holdings SET Quantity = ? WHERE HoldingID = ?',
            [currentQuantity, holdingRows[0].HoldingID],
            (err) => (err ? reject(err) : resolve())
          )
        );
      }
    } else if (currentQuantity != 0) {
      console.log(`Inserting holding for ticker ${ticker}...`);
      await new Promise((resolve, reject) =>
        connection.query(
          'INSERT INTO Portfolio_Holdings (PortfolioID, Ticker, Quantity) VALUES (?, ?, ?)',
          [portfolioID, ticker, currentQuantity],
          (err) => (err ? reject(err) : resolve())
        )
      );
    }

    // Update the portfolio's total value
    const updatedPortfolioValue = isBuying
      ? portfolioValue + totalCostOrRevenue
      : portfolioValue - totalCostOrRevenue;
    console.log(`Updating portfolio total value to ${updatedPortfolioValue}...`);
    await new Promise((resolve, reject) =>
      connection.query(
        'UPDATE Portfolios SET TotalValue = ? WHERE PortfolioID = ?',
        [updatedPortfolioValue, portfolioID],
        (err) => (err ? reject(err) : resolve())
      )
    );

    // Update the cash portfolio
    console.log(`Fetching cash portfolio for user ${userID}...`);
    const cashPortfolioRows = await new Promise((resolve, reject) =>
      connection.query(
        'SELECT PortfolioID, TotalValue FROM Portfolios WHERE UserID = ? AND PortfolioType = ?',
        [userID, 'cash'],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );

    console.log('Cash portfolio rows retrieved:', cashPortfolioRows);

    if (cashPortfolioRows.length === 0) {
      throw new Error('User does not have a cash portfolio.');
    }

    const cashPortfolioID = cashPortfolioRows[0].PortfolioID;
    const cashUpdateValue = isBuying ? -totalCostOrRevenue : totalCostOrRevenue;

    console.log(`Updating cash portfolio value by ${cashUpdateValue}...`);
    await new Promise((resolve, reject) =>
      connection.query(
        'UPDATE Portfolios SET TotalValue = TotalValue + ? WHERE PortfolioID = ?',
        [cashUpdateValue, cashPortfolioID],
        (err) => (err ? reject(err) : resolve())
      )
    );

    // Record the transaction
    const transactionType = isBuying ? 'BUY' : 'SELL';
    console.log(`Recording transaction for ${ticker}...`);
    await new Promise((resolve, reject) =>
      connection.query(
        'INSERT INTO Transactions (UserID, Ticker, TransactionType, Quantity, Price, Date) VALUES (?, ?, ?, ?, ?, ?)',
        [userID, ticker, transactionType, quantity, price, date],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );

    // Commit the transaction
    await new Promise((resolve, reject) =>
      connection.commit((err) => (err ? reject(err) : resolve()))
    );

    console.log(`Stock ${ticker} ${transactionType} successfully completed.`);
  } catch (error) {
    await new Promise((resolve, reject) =>
      connection.rollback((err) => (err ? reject(err) : resolve()))
    );
    console.error('Error trading stock:', error.message);
    throw error;
  }
}

// update MySQL table 'stock_prices' based on 'date'
async function updateStockPrices(date) {
  const connection = db;
  let stock_count = 0;
  try {
    // Begin transaction to ensure all updates are done atomically
    await new Promise((resolve, reject) =>
      connection.beginTransaction((err) => (err ? reject(err) : resolve()))
    );

    // Fetch all unique tickers from the stock prices table
    const tickers = await new Promise((resolve, reject) =>
      connection.query(
        'SELECT DISTINCT Ticker FROM stock_prices',
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );

    for (const tickerRow of tickers) {
      const ticker = tickerRow.Ticker;
      // console.log(`Fetching stock data for ${ticker} up to ${date}...`);

      // Fetch the last available stock price date for this ticker
      const lastPriceDateRow = await new Promise((resolve, reject) =>
        connection.query(
          'SELECT MAX(Date) AS LastDate FROM stock_prices WHERE Ticker = ?',
          [ticker],
          (err, results) => (err ? reject(err) : resolve(results))
        )
      );

      const lastDate = lastPriceDateRow[0].LastDate;
      let startDate = lastDate ? new Date(lastDate) : new Date('2019-01-01'); // Default to 2019 if no previous data

      // Ensure the start date is the next day after the last recorded date
      startDate.setDate(startDate.getDate() + 1);
      const formattedStartDate = startDate.toISOString().split('T')[0];

      // Only fetch data from the last date to the requested date
      if (startDate <= new Date(date)) {
        const stockData = await yahooFinance.historical(ticker, {
          period1: formattedStartDate, // Start from the next day after last available date
          period2: date, // Up to the specified date
          interval: '1d', // Daily interval
        });

        // Insert or update stock data in the database
        for (const data of stockData) {
          const { date: stockDate, close: stockPrice } = data;

          // Format the date to match the format in the database (e.g., 'YYYY-MM-DD')
          const formattedDate = stockDate.toISOString().split('T')[0];

          // Check if the price for this date already exists
          const existingPriceRows = await new Promise((resolve, reject) =>
            connection.query(
              'SELECT * FROM stock_prices WHERE Ticker = ? AND Date = ?',
              [ticker, formattedDate],
              (err, results) => (err ? reject(err) : resolve(results))
            )
          );

          if (existingPriceRows.length === 0) {
            // If no price exists, insert the new data
            await new Promise((resolve, reject) =>
              connection.query(
                'INSERT INTO stock_prices (Ticker, Date, Price) VALUES (?, ?, ?)',
                [ticker, formattedDate, stockPrice],
                (err) => (err ? reject(err) : resolve())
              )
            );
            stock_count += 1;
            // console.log(`Inserted price for ${ticker} on ${formattedDate}: ${stockPrice}`);
          } else {
            // If price exists, update the existing record
            await new Promise((resolve, reject) =>
              connection.query(
                'UPDATE stock_prices SET Price = ? WHERE Ticker = ? AND Date = ?',
                [stockPrice, ticker, formattedDate],
                (err) => (err ? reject(err) : resolve())
              )
            );
            // console.log(`Updated price for ${ticker} on ${formattedDate}: ${stockPrice}`);
          }
        }
      } else {
        // console.log(`No data needed for ${ticker} since the last update is already up-to-date.`);
      }
    }

    // Commit the transaction
    await new Promise((resolve, reject) =>
      connection.commit((err) => (err ? reject(err) : resolve()))
    );

    console.log(stock_count, 'stock prices and index updated successfully up to', date);
  } catch (error) {
    // Rollback in case of an error
    await new Promise((resolve, reject) =>
      connection.rollback((err) => (err ? reject(err) : resolve()))
    );
    console.error('Error updating stock prices:', error.message);
    throw error;
  }
}

// calculate number of days from start
function calculateDaysFromStart(cDate, sDate) {
  const startDate = new Date(sDate); // Parse the start date string
  const currentDate = new Date(cDate); // Get the current date
  
  // Calculate the difference in time between the two dates
  const timeDifference = currentDate - startDate;
  
  // Convert the time difference from milliseconds to days
  const daysDifference = timeDifference / (1000 * 3600 * 24);
  
  return Math.floor(daysDifference); // Return the difference as a whole number
}

async function increaseDateBy(currDate, days) {
  const date = new Date(currDate);  // Create a Date object from the current date string
  date.setDate(date.getDate() + days + 1);  // Increase the date by the specified number of days

  // Format the resulting date as 'YYYY-MM-DD'
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');  // Months are 0-indexed, so add 1
  const day = String(date.getDate()).padStart(2, '0');  

  return `${year}-${month}-${day}`;  // Return the formatted date
}

async function updatePortfolioValue(userID, date) {
  const connection = db;

  try {
    // Begin transaction to ensure all updates are done atomically
    await new Promise((resolve, reject) =>
      connection.beginTransaction((err) => (err ? reject(err) : resolve()))
    );

    // Fetch all portfolios for the user
    const portfolios = await new Promise((resolve, reject) =>
      connection.query(
        'SELECT PortfolioID, UserID, TotalValue, PortfolioType, modDate FROM Portfolios WHERE UserID = ?',
        [userID],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );

    // Process each portfolio
    for (const portfolio of portfolios) {
      const { PortfolioID, PortfolioType, TotalValue } = portfolio;
      let newTotalValue = TotalValue;

      if (PortfolioType === 'cash') {
        console.log('looking at cash portfolio');
        // For 'cash' portfolio, apply continuous compounding interest (2% annual rate)
        // console.log(`new date is ${date}`);
        const mod_date = new Date(portfolio.modDate);
        const formattedDate = mod_date.toISOString().split('T')[0];
        // console.log(`mod date is ${formattedDate}`);
        const timeInYears = calculateDaysFromStart(date, formattedDate) / 365;
        const interestRate = interest_rate;
        // console.log(interestRate);
        newTotalValue = TotalValue * Math.exp(interestRate * timeInYears);
        if (isNaN(newTotalValue)){
          console.log(`NaN on ${date}. Using old value`);
          newTotalValue = TotalValue;
        }
        // console.log(`old ${TotalValue}, new ${newTotalValue}, time ${timeInYears}`);
        // Update the cash portfolio value in the Portfolios table
        await new Promise((resolve, reject) =>
          connection.query(
            'UPDATE Portfolios SET TotalValue = ?, modDate = ? WHERE PortfolioID = ? AND UserID = ?',
            [newTotalValue, date, PortfolioID, userID],
            (err) => (err ? reject(err) : resolve())
          )
        );
        console.log(`Updated cash portfolio ${PortfolioID} value to ${newTotalValue}`);

        // Write cash portfolio to Portfolio_Value_History
        await new Promise((resolve, reject) =>
          connection.query(
            'INSERT INTO Portfolio_Value_History (UserID, PortfolioID, Date, TotalValue) VALUES (?, ?, ?, ?)',
            [userID, PortfolioID, date, newTotalValue],
            (err) => (err ? reject(err) : resolve())
          )
        );
        console.log(`Inserted cash portfolio ${PortfolioID} value history for ${date}`);
      } else {
        // For other types of portfolios, calculate the total value based on shares and stock prices
        newTotalValue = 0;

        // Fetch the stock holdings for this portfolio
        const holdings = await new Promise((resolve, reject) =>
          connection.query(
            'SELECT Ticker, Quantity FROM Portfolio_Holdings WHERE PortfolioID = ?',
            [PortfolioID],
            (err, results) => (err ? reject(err) : resolve(results))
          )
        );

        // For each stock holding, get its price on the specified date and calculate the total value
        for (const holding of holdings) {
          const { Ticker, Quantity } = holding;

          // Fetch the stock price for the specified date
          let stockPriceRows = await new Promise((resolve, reject) =>
            connection.query(
              'SELECT Price FROM stock_prices WHERE Ticker = ? AND Date = ?',
              [Ticker, date],
              (err, results) => (err ? reject(err) : resolve(results))
            )
          );

          if (stockPriceRows.length === 0) {
            console.log(`No price found for ${Ticker} on ${date}. Searching for the last available price.`);

            // If no price is found for the given date, fetch the most recent price
            stockPriceRows = await new Promise((resolve, reject) =>
              connection.query(
                'SELECT Price FROM stock_prices WHERE Ticker = ? AND Date <= ? ORDER BY Date DESC LIMIT 1',
                [Ticker, date],
                (err, results) => (err ? reject(err) : resolve(results))
              )
            );

            if (stockPriceRows.length === 0) {
              console.log(`No price available for ${Ticker}. Skipping.`);
              continue; // Skip this stock if no historical price is found
            }

            console.log(`Using last available price for ${Ticker}: ${stockPriceRows[0].Price}`);
          }

          const stockPrice = stockPriceRows[0].Price;
          const stockValue = stockPrice * Quantity;
          newTotalValue += stockValue;
        }

        // Update the portfolio's total value in the Portfolios table
        await new Promise((resolve, reject) =>
          connection.query(
            'UPDATE Portfolios SET TotalValue = ?, modDate = ? WHERE PortfolioID = ? AND UserID = ?',
            [newTotalValue, date, PortfolioID, userID],
            (err) => (err ? reject(err) : resolve())
          )
        );
        // console.log(`Updated portfolio ${PortfolioID} value to ${newTotalValue}`);

        // Write non-cash portfolio to Portfolio_Value_History
        await new Promise((resolve, reject) =>
          connection.query(
            'INSERT INTO Portfolio_Value_History (UserID, PortfolioID, Date, TotalValue) VALUES (?, ?, ?, ?)',
            [userID, PortfolioID, date, newTotalValue],
            (err) => (err ? reject(err) : resolve())
          )
        );
        console.log(`Inserted portfolio ${PortfolioID} value history for ${date}`);
      }
    }

    // Commit the transaction
    await new Promise((resolve, reject) =>
      connection.commit((err) => (err ? reject(err) : resolve()))
    );

    console.log('All portfolios updated successfully.');
  } catch (error) {
    // Rollback the transaction in case of an error
    await new Promise((resolve, reject) =>
      connection.rollback((err) => (err ? reject(err) : resolve()))
    );
    console.error('Error updating portfolio values:', error.message);
    throw error;
  }
}

// async python child process for machine learning functions
async function callPythonProcess(csvFilePath) {
  return new Promise((resolve, reject) => {
    // Path to the Python script
    const pythonScript = path.resolve('./pca_linreg.py');
    
    // Spawn the Python process
    const pythonProcess = spawn('python', [pythonScript, csvFilePath]);

    let output = '';
    let errorOutput = '';

    // Capture Python script's stdout
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Capture Python script's stderr
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Handle process exit
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          // Parse JSON output from Python script
          const result = JSON.parse(output);
          resolve(result);
        } catch (err) {
          reject(`Error parsing JSON: ${err.message}`);
        }
      } else {
        reject(`Python process exited with code ${code}: ${errorOutput}`);
      }
    });

    // Handle process errors
    pythonProcess.on('error', (error) => {
      reject(`Failed to start Python process: ${error.message}`);
    });
  });
}

function getAnalysisStartDate(currentDate, timeHorizon) {
  // Parse the currentDate string into a JavaScript Date object
  const current = new Date(currentDate);

  // Subtract the timeHorizon in years from the current date
  current.setFullYear(current.getFullYear() - timeHorizon);

  // Format the result as 'YYYY-MM-DD'
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(current.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

async function portfolio_by_PCA(userID, totalValue, symbols, weights, prices, date) {
  // Validate input lengths
  if (symbols.length !== weights.length || symbols.length !== prices.length) {
    throw new Error('Symbols, weights, and prices arrays must be of the same length.');
  }

  console.log('Starting portfolio update using PCA recommendations...');
  console.log(`with ${totalValue} cash`);

  for (let i = 0; i < symbols.length; i++) {
    const ticker = symbols[i];
    const weight = weights[i];
    const price = prices[i];

    // Calculate number of shares to buy
    const quantity = Math.ceil((totalValue * weight) / price);

    if (quantity === 0) {
      console.log(`Skipping ${ticker}: calculated quantity is 0.`);
      continue;
    }

    try {
      console.log(`Processing trade for ${ticker}: Buying ${quantity} shares at price ${price}.`);
      await tradeStock(userID, ticker, quantity, date, 'algorithmic');
      console.log(`Successfully traded ${ticker}.`);
    } catch (error) {
      console.error(`Error trading ${ticker}: ${error.message}`);
    }
  }

  console.log('Portfolio update completed.');
}

// async function to call python process with defined parameters
async function PCA_analysis(userID, analysis_start_date, analysis_end_date, totalValue, trade_date) {
  const analysis = new StockAnalysis(lstIXIC, analysis_start_date, analysis_end_date, interest_rate);

  try {
    console.log(`begin machine learning process.`);
    // Fetch and process data
    await analysis.fetchData();
    console.log(`calculating log returns of stocks during analysis period`);
    analysis.getReturns();
    analysis.writeReturnsToCSV('./input/log_returns.csv');

    // Call the Python process with the CSV file
    const csvFilePath = './input/log_returns.csv';
    console.log(`calculating portfolio compositions.`)
    const result = await callPythonProcess(csvFilePath);

    // Extract symbols and weights
    const symbols = result.features;
    const weights = result.weights;

    console.log('\x1b[36m%s\x1b[0m','Suggested portfolio symbols:', symbols);
    console.log('\x1b[36m%s\x1b[0m','Suggested weights:', weights);

    // Fetch the current prices for all symbols on the given date
    const prices = await Promise.all(
      symbols.map(async (ticker) => {
        const priceRows = await new Promise((resolve, reject) =>
          db.query(
            'SELECT Price FROM stock_prices WHERE Ticker = ? AND Date = ?',
            [ticker, trade_date],
            (err, results) => (err ? reject(err) : resolve(results))
          )
        );

        if (priceRows.length === 0) {
          console.log(`No price found for ${ticker} on ${trade_date}. Updating stock data...`);
          await getStockData(ticker, trade_date);

          // Retry fetching the stock price
          const updatedPriceRows = await new Promise((resolve, reject) =>
            db.query(
              'SELECT Price FROM stock_prices WHERE Ticker = ? AND Date = ?',
              [ticker, trade_date],
              (err, results) => (err ? reject(err) : resolve(results))
            )
          );

          if (updatedPriceRows.length === 0) {
            throw new Error(`Price for ${ticker} on ${trade_date} not found even after update.`);
          }

          return updatedPriceRows[0].Price;
        }

        return priceRows[0].Price;
      })
    );

    console.log('Prices:', prices);

    // Call port_by_PCA with the prepared inputs
    console.log(`Creating algorithmic portfolio with suggested symbos and allocated weights.`)
    await portfolio_by_PCA(userID, totalValue, symbols, weights, prices, trade_date);

  } catch (error) {
    console.error(`Error in PCA_analysis: ${error.message}`);
  }
}

async function make_portfolio_from_PCA(userID, totalValue, symbols, weights, prices, date) {
  // Validate input lengths
  if (symbols.length !== weights.length || symbols.length !== prices.length) {
    throw new Error('Symbols, weights, and prices arrays must be of the same length.');
  }

  console.log('Starting portfolio update using PCA recommendations...');

  for (let i = 0; i < symbols.length; i++) {
    const ticker = symbols[i];
    const weight = weights[i];
    const price = prices[i];

    // Calculate number of shares to buy
    if (weight > 0){
      const quantity = Math.floor((totalValue * weight) / price);
    } else {
      const quantity = Math.ceil((totalValue * weight) / price);
    }

    if (quantity === 0) {
      console.log(`Skipping ${ticker}: calculated quantity is 0.`);
      continue;
    }

    try {
      // console.log(`Processing trade for ${ticker}: Buying ${quantity} shares at price ${price}.`);
      await tradeStock(userID, ticker, quantity, date, 'algorithmic');
      console.log(`Successfully traded ${ticker}.`);
    } catch (error) {
      console.error(`Error trading ${ticker}: ${error.message}`);
    }
  }

  console.log('Portfolio update completed.');
}

async function reset_db() {
  try {
    // Begin transaction to ensure all resets are done atomically
    await new Promise((resolve, reject) =>
      db.beginTransaction((err) => (err ? reject(err) : resolve()))
    );

    // Delete all records in `portfolio_value_history` before `Portfolios` due to foreign key constraint
    await new Promise((resolve, reject) =>
      db.query('DELETE FROM portfolio_value_history', (err) => (err ? reject(err) : resolve()))
    );

    // Delete all records in the other tables
    await new Promise((resolve, reject) =>
      db.query('DELETE FROM Transactions', (err) => (err ? reject(err) : resolve()))
    );
    await new Promise((resolve, reject) =>
      db.query('DELETE FROM Portfolio_Holdings', (err) => (err ? reject(err) : resolve()))
    );
    await new Promise((resolve, reject) =>
      db.query('DELETE FROM Portfolios', (err) => (err ? reject(err) : resolve()))
    );

    // Reset the AUTO_INCREMENT for all tables
    await new Promise((resolve, reject) =>
      db.query('ALTER TABLE portfolio_value_history AUTO_INCREMENT = 1', (err) => (err ? reject(err) : resolve()))
    );
    await new Promise((resolve, reject) =>
      db.query('ALTER TABLE Transactions AUTO_INCREMENT = 1', (err) => (err ? reject(err) : resolve()))
    );
    await new Promise((resolve, reject) =>
      db.query('ALTER TABLE Portfolio_Holdings AUTO_INCREMENT = 1', (err) => (err ? reject(err) : resolve()))
    );
    await new Promise((resolve, reject) =>
      db.query('ALTER TABLE Portfolios AUTO_INCREMENT = 3', (err) => (err ? reject(err) : resolve()))
    );

    // Re-insert initial data into the `Portfolios` table
    await new Promise((resolve, reject) =>
      db.query(
        `INSERT INTO Portfolios (UserID, TotalValue, PortfolioType, modDate) VALUES
          (1, ?, 'cash', ?),
          (2, ?, 'cash', ?)`,
          [initialSimCash, simStartDay, initialSimCash, simStartDay], 
        (err) => (err ? reject(err) : resolve())
      )
    );
    // Commit the transaction
    await new Promise((resolve, reject) =>
      db.commit((err) => (err ? reject(err) : resolve()))
    );

    console.log('Database reset successfully');
  } catch (error) {
    // Rollback in case of an error
    await new Promise((resolve, reject) =>
      db.rollback((err) => (err ? reject(err) : resolve()))
    );
    console.error('Error resetting database:', error.message);
    throw error;
  }
}

const curr_date = '2024-10-01';
// const interest_rate = 0.02;
async function temp(){  
  const tick = 'AAPL';
  const sDate = '2024-08-02';
  const eDate = '2024-10-02';
  const analysis = new StockAnalysis([tick], sDate, eDate);
  const results = await analysis.analyze();
  console.log(results);

}

// temp(); 

// Helper function to fetch the last buy price for the portfolio
async function getLastBuyPrice(ticker, userID, date) {
  const connection = db;

  try {
    // Fetch the last buy transaction for the stock before the specified date
    const query = `
      SELECT Price 
      FROM Transactions 
      WHERE Ticker = ? 
        AND UserID = ? 
        AND TransactionType = 'buy' 
        AND Date <= ? 
      ORDER BY Date DESC 
      LIMIT 1
    `;
    
    



    const results = await new Promise((resolve, reject) =>
      connection.query(query, [ticker, userID, date], (err, results) => {
        if (err) return reject(err);
        resolve(results);
      })
    );

    // If no results found, return null (no buy transaction for the given ticker before the date)
    if (results.length === 0) {
      console.log(`No buy transactions found for ${ticker} before ${date}.`);
      return null;
    }

    // Return the price of the last buy transaction
    const lastBuyPrice = results[0].Price;
    console.log(`Last buy price for ${ticker} on or before ${date}: ${lastBuyPrice}`);
    return lastBuyPrice;

  } catch (error) {
    console.error(`Error fetching last buy price for ${ticker}: ${error.message}`);
    throw error;
  }
}

// trend following 
async function trendFollowing(userID, symbol, current_date, start_date, end_date, numShares, actionAtEnd = 'hold') {
  const connection = db; // Assumes you have a database connection ready
  const analysis = new StockAnalysis([symbol], start_date, end_date, 0.02); // Use your `StockAnalysis` class

  try {
    console.log(`Monitoring trend-following strategy for ${symbol} on ${current_date} to ${end_date}.`);

    // Fetch historical price data and calculate daily differences
    await analysis.fetchData();
    analysis.getDailyDifference();

    // Ensure the current date is within the monitoring period
    if (!analysis.dates.includes(current_date)) {
      console.log("Current date not in the specified date range.");
      return;
    }

    const currentIndex = analysis.dates.indexOf(current_date);

    if (currentIndex <= 0) {
      console.log("Insufficient data for trend-following.");
      return;
    }

    // Retrieve today's and previous day's daily differences
    const prevDate = analysis.dates[currentIndex - 1];
    const todayDiff = analysis.dailyDiffs[symbol]?.[current_date];
    const prevDiff = analysis.dailyDiffs[symbol]?.[prevDate];

    if (prevDiff === undefined || todayDiff === undefined) {
      console.log("Insufficient dailyDiffs data for decision-making.");
      return;
    }

    // Query the database to determine current quantity
    const portfolioQuery = `
      SELECT p.PortfolioID, ph.Quantity
      FROM Portfolios p
      JOIN Portfolio_Holdings ph ON p.PortfolioID = ph.PortfolioID
      WHERE p.UserID = ? AND p.PortfolioType = 'strategic' AND p.TotalValue > 0 AND ph.Ticker = ?`;

    let rows;
    try {
      rows = await new Promise((resolve, reject) => {
        connection.query(portfolioQuery, [userID, symbol], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });
    } catch (queryError) {
      // console.error('Error executing query:', queryError);
      rows = [];
    }

    let quantity = 0; // Default quantity if no portfolio is found
    if (rows.length > 0) {
      quantity = rows[0].Quantity;
      console.log(`Current quantity for ${symbol}: ${quantity}`);
    } else {
      console.log(`No holdings found for ${symbol} in strategic portfolio.`);
    }

    // Decision-making based on trend signals
    if (prevDiff < 0 && todayDiff > 0) {
      console.log(`Potential buy signal for date ${current_date}`);
      if (quantity === 0) {
        console.log('\x1b[36m%s\x1b[0m',`Buying ${numShares} of ${symbol} on ${current_date}.`);
        await tradeStock(userID, symbol, numShares, current_date, 'strategic');
      } else {
        console.log(`User already has position in ${symbol}, skipping buy.`);
      }
    } else if (prevDiff > 0 && todayDiff < 0) {
      console.log(`Potential sell signal for date ${current_date}`);
      if (quantity > 0) {
        
        // const { PortfolioID } = rows[0];
        const buyPrice = await getLastBuyPrice( symbol, userID, current_date);
        console.log(`last purchase prices was ${buyPrice}`);
        const todayPrice = analysis.dailyPrices[symbol]?.[current_date];
        console.log(`today's prices is ${todayPrice}`);
        if (todayPrice > buyPrice) {
          console.log('\x1b[36m%s\x1b[0m',`Selling ${quantity} of ${symbol} on ${current_date}.`);
          await tradeStock(userID, symbol, -quantity, current_date, 'strategic');
        } else {
          console.log(`No action: Current price (${todayPrice}) <= Buy price (${buyPrice}).`);
        }
      } else {
        console.log("No holdings to sell.");
      }
    } else {
      console.log(`No trade signals for ${symbol} on ${current_date}.`);
    }

    // End of period action
    if (current_date >= end_date) {
      if (actionAtEnd === 'sell' && quantity !== 0) {
        console.log(`End date reached for ${symbol}, selling remaining ${quantity} shares.`);
        await tradeStock(userID, symbol, -quantity, current_date, 'strategic');
      } else if (actionAtEnd === 'hold') {
        console.log(`End date reached for ${symbol}, holding position.`);
      }
    }
  } catch (error) {
    console.error(`Error in trendFollowing strategy: ${error.message}`);
  }
  // updatePortfolioValue(userID, current_date);
}

function writePortHistoryToCSV(userID, start_date, end_date, csvPath) {
  // Create MySQL connection
  const connection = mysql.createConnection({
    host: 'localhost',  // Your MySQL host
    user: 'root',  // Your MySQL username
    password: 'client_password',  // Your MySQL password
    database: 'stock_data',  // Your database name
  });

  connection.connect((err) => {
    if (err) {
      console.error('Error connecting to the database:', err.stack);
      return;
    }
    console.log('Connected to the database.');
  });

  // SQL query with JOIN to fetch portfolio history and portfolio types
  let query = `
    SELECT pvh.Date AS TransactionDate, pvh.PortfolioID, pvh.TotalValue, p.PortfolioType
    FROM Portfolio_Value_History pvh
    INNER JOIN Portfolios p ON pvh.PortfolioID = p.PortfolioID
    WHERE pvh.UserID = ? AND pvh.Date BETWEEN ? AND ?
  `;

  // Query to fetch portfolio data based on userID and date range
  connection.query(query, [userID, start_date, end_date], (err, results) => {
    if (err) {
      console.error('Error executing query:', err.stack);
      connection.end(); // End the connection
      return;
    }

    let rows = [];
    let portfolioData = {
      cash: {},
      manual: {},
      strategic: {},
      algorithmic: {},
    };

    // Organize results into portfolio data by type
    results.forEach((row) => {
      const { TransactionDate, PortfolioType, TotalValue } = row;

      // Format the date as MM/DD/YYYY
      const formattedDate = new Date(TransactionDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      if (!portfolioData[PortfolioType][formattedDate]) {
        portfolioData[PortfolioType][formattedDate] = 0;
      }
      portfolioData[PortfolioType][formattedDate] += TotalValue;
    });

    // Build rows for CSV (one row for each date)
    const allDates = Object.keys(portfolioData.cash).sort(
      (a, b) => new Date(a) - new Date(b)
    ); // Sort dates
    allDates.forEach((date) => {
      const row = {
        Date: date,
        Cash: portfolioData.cash[date] || 0,
        Manual: portfolioData.manual[date] || 0,
        Strategic: portfolioData.strategic[date] || 0,
        Algorithmic: portfolioData.algorithmic[date] || 0,
        Total: (portfolioData.cash[date] || 0) +
          (portfolioData.manual[date] || 0) +
          (portfolioData.strategic[date] || 0) +
          (portfolioData.algorithmic[date] || 0), 
        CashStrategic: (portfolioData.cash[date] || 0) +
          (portfolioData.strategic[date] || 0), 
      };
      rows.push(row);
    });

    // Write the results to CSV
    writeCSV(rows, csvPath);
    connection.end(); // End the connection
  });

  // Function to write the data to a CSV file
  function writeCSV(rows, filePath) {
    const header = ['Date', 'Cash', 'Manual', 'Strategic', 'Algorithmic', 'Cash+Strategic', 'Total'];
    const csvData = rows.map((row) => {
      return `${row.Date},${row.Cash},${row.Manual},${row.Strategic},${row.Algorithmic},${row.CashStrategic},${row.Total}`;
    });

    // Write the CSV file
    fs.writeFileSync(filePath, [header.join(','), ...csvData].join('\n'));
    console.log(`CSV file successfully written to ${filePath}`);
  }
}

async function getRandomStocks(lstStocks, random_state = null) {
 // Helper to set random seed (if random_state is provided)
  function seedRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  if (random_state !== null) {
    Math.random = (function(seed) {
        return function() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    })(random_state);
  }
  
  const selectedStocks = [...lstStocks]
    .sort(() => Math.random() - 0.5)
    .slice(0, 20);

  return selectedStocks;
}

async function getTop20StocksBySharpeRatio(lstStocks, analysis_start_date, analysis_end_date, interest_rate) {
  // Create an instance of StockAnalysis
  const analysis = new StockAnalysis(lstStocks, analysis_start_date, analysis_end_date, interest_rate);
  await analysis.analyze();
  // Fetch Sharpe Ratios for all stocks asynchronously
  const sharpeRatios = await analysis.getSharpeRatio(); // Await the result of the Sharpe ratio calculation

  // Extract Sharpe Ratios and corresponding tickers
  const results = lstIXIC.map((ticker) => ({
    ticker,
    sharpeRatio: sharpeRatios[ticker], // Extract the specific Sharpe Ratio for each ticker
  }));

  // Sort the results by Sharpe Ratio in descending order and take the top 20
  const top20Stocks = results
    .sort((a, b) => b.sharpeRatio - a.sharpeRatio) // Sort by Sharpe Ratio in descending order
    .slice(0, 20); // Get the top 20

  // console.log(top20Stocks); // Optional: Log the sorted list of top 20 stocks

  return top20Stocks; // Return the top 20 stocks by Sharpe ratio
}


async function getStockPriceByDate(ticker, date) {
  /**
   * Fetches the stock price for the given ticker and date.
   * If the price is unavailable, updates the stock prices and retries.
   * 
   * @param {object} connection - Database connection.
   * @param {string} ticker - Stock ticker.
   * @param {string} date - Date for which the price is needed (YYYY-MM-DD).
   * @returns {number} - Stock price on the given date.
   * @throws {Error} - If the price cannot be retrieved after update.
   */

  const connection = db; 
  console.log(`Fetching stock price for ${ticker} on ${date}...`);
  const priceRows = await new Promise((resolve, reject) =>
    connection.query(
      'SELECT Price FROM stock_prices WHERE Ticker = ? AND Date = ?',
      [ticker, date],
      (err, results) => (err ? reject(err) : resolve(results))
    )
  );

  // console.log('Price rows retrieved:', priceRows);

  if (priceRows.length === 0) {
    console.log(`No stock price found for ${ticker} on ${date}. Updating stock prices.`);
    await getStockData(ticker, date);

    const updatedPriceRows = await new Promise((resolve, reject) =>
      connection.query(
        'SELECT Price FROM stock_prices WHERE Ticker = ? AND Date = ?',
        [ticker, date],
        (err, results) => (err ? reject(err) : resolve(results))
      )
    );

    console.log('Updated price rows:', updatedPriceRows);

    if (updatedPriceRows.length === 0) {
      throw new Error(`Unable to retrieve price for ${ticker} on ${date} after update.`);
    }

    return updatedPriceRows[0].Price;
  }

  return priceRows[0].Price;
}

async function makePortfolio(userID, lstStocks, initPortVal, trade_date, portType) {
  /**
   * Creates a manual portfolio by randomly selecting 20 stocks, allocating equal weights, 
   * and purchasing an integer number of shares.
   * 
   * @param {string} userID - User ID for the portfolio.
   * @param {string[]} lstStocks - List of stock tickers to choose from.
   * @param {number} initPortVal - Initial investment value.
   * @param {string} trade_date - The date of the trade in 'YYYY-MM-DD' format.
   * @param {string} portType - portfolio type
   * @returns {object} Portfolio with selected stocks and quantities purchased.
   */
  
  const allocationPerStock = initPortVal / lstStocks.length;
  const portfolio = {};
  
  // Iterate through the selected stocks
  for (const ticker of lstStocks) {      
      const price = await getStockPriceByDate(ticker, trade_date);
      
      if (price > 0) {
          // Step 2: Calculate number of shares to buy (floor)
          const quantity = Math.floor(allocationPerStock / price);
          
          if (quantity > 0) {
              // Step 3: Trade stock
              console.log(`making portfolio for ${userID}`)
              await tradeStock(userID, ticker, quantity, trade_date, portType);
              portfolio[ticker] = quantity;
          }
      }
  }

  return portfolio;
}

async function run_simulations(){
  // const numDays = 55
  const outoutCSV = './output/portfolio_history.csv';   // defines output file
  const analysis_end_date = simStartDay  // analysis for technical and PCA stops at the simStartDay
  const analysis_start_date = await getAnalysisStartDate(simStartDay, 1); // analysis begins 1 year ago
  const simEndDay = await increaseDateBy(simStartDay, numDaysToSimulate);  // calculate simulation end date 
  
  const singlePortVal = 30000;

  const lstStocks = lstIXIC.slice(0, lstIXIC.length - 1);  // exclude index values

  // select top 20 stocks by sharpe ratio for manual
  const manualPortfolioSymbolsSharpes = await getTop20StocksBySharpeRatio(lstStocks, analysis_start_date, simStartDay, interest_rate);
  const manualPortfolioSymbols = manualPortfolioSymbolsSharpes.map(stock => stock.ticker);
  await makePortfolio(1, manualPortfolioSymbols, singlePortVal, simStartDay, 'manual');

  // PCA to select 20 stocks, Linear Regression to fit index --> algorithmic
  console.log("PCA starts");
  await PCA_analysis(1, analysis_start_date, analysis_end_date, singlePortVal, simStartDay);  // calculate portfolio compositions and allocate 50000 cash to algorithmic portfolio
  console.log("PCA endds");
  // strategic 
  const stratPortfolioSymbols = await getRandomStocks(lstStocks);
  const stratPortfolio = await makePortfolio(1, stratPortfolioSymbols, singlePortVal, simStartDay, 'strategic');

  // random 20 stocks with trend following --> strategic 
  for (let i = 1; i < numDaysToSimulate; i++) {   
    let new_Date = await increaseDateBy(simStartDay, i);
    console.log(`TODAY'S DATE IS ${new_Date}`);
    for ( const [stratTicker, stratShare] of Object.entries(stratPortfolio)) {
      await trendFollowing(1, stratTicker, new_Date, simStartDay, simEndDay, stratShare);
    }
    // strategic trend following for the duration of the monitoring period
    // await trendFollowing(1, 'TSLA', new_Date, simStartDay, simEndDay, 100);
    
    await updatePortfolioValue(1, new_Date);
  }

  // dump portfolio values to .csv at the end of the simulation
  await writePortHistoryToCSV(1, simStartDay, simEndDay, outoutCSV);
}

async function simulatorAnalysis(stockSymbol, startDate, endDate, currentDate) {
  const analysis = new StockAnalysis(stockSymbol, startDate, endDate);
  const results = await analysis.analyze();
  
  const todayPrice = await getStockPriceByDate(stockSymbol, currentDate);
  const dailyPrices = Object.entries(results.dailyPrices[stockSymbol]);

  const sharpeRatio = results.sharpeRatio[stockSymbol];
  const totalLogReturn = results.totalReturn[stockSymbol];
  const mean = results.mean;
  const min = results.min;
  const max = results.max;
  const dailyDiffs = results.dailyDiffs;
  
 
  // console.log(todayPrice);
  // console.log(sharpeRatio);  // optional output
  // console.log(dailyPrices);

  return {
    todayPrice,
    dailyPrices,    
    dailyDiffs,
    sharpeRatio,
    totalLogReturn,
    mean,
    min,
    max,  
  };
}

async function main(){   
  // demo #1 StockAnalysis Class object
  // const stockSymbol = 'AAPL';
  // const analysis_startDate = '2024-10-07';
  // const analysis_endDate = '2024-11-20';
  // const currentDate = '2024-10-07';

  // const result = await simulatorAnalysis([stockSymbol], analysis_startDate, analysis_endDate, currentDate);
  // console.log(result);

  // demo #2 tradeStock manually 
  // show db 
  // await reset_db();   // reset database tables
  // show users table

  // await tradeStock(1, stockSymbol, 10, currentDate, 'manual');  
  // show tables transactions -> porfolio_holdings -> portfolios,  each gets a new entry/ update

  // await updatePortfolioValue(1, currentDate);  // db portfolio_value_histroy gets an update

  // let new_Date = await increaseDateBy(currentDate, 1); // increase date by 1 day
  // console.log(`new date is ${new_Date}`);

  // await tradeStock(1, stockSymbol, -10, new_Date, 'manual');
  // await tradeStock(1, 'GOOGL', 5, new_Date, 'manual');

  // await updatePortfolioValue(1, new_Date);


  // demo #3 trend following
  // await reset_db();
  // const numDays = 30; 
  // for (let i = 1; i < numDays; i++) {   
  //   let new_Date = await increaseDateBy(currentDate, i);
  //   console.log(`TODAY'S DATE IS ${new_Date}`);  // '2024-11-26'
  //   await trendFollowing(1, stockSymbol, new_Date, currentDate, '2024-11-20', 10);
  //   await updatePortfolioValue(1, new_Date);
  // }

  // demo #4 algorithmic trade
  // await reset_db();
  // console.log("Process starts");
  // await PCA_analysis(1, analysis_startDate, analysis_endDate, 10000, currentDate);  // calculate portfolio compositions and allocate 50000 cash to algorithmic portfolio
  // console.log("Process ends");


  await reset_db(); 
  console.time('run_simulations');
  await run_simulations();  
  console.timeEnd('run_simulations');
}


if (require.main === module) {
  console.log("Script is being run directly.");
  main();
} else {
  console.log("Script is being imported as a module.");
}


module.exports = { 
  StockAnalysis,
  PortfolioAnalysis,
  getStockData,
  tradeStock,
  updateStockPrices,
  updatePortfolioValue,
  reset_db,
  PCA_analysis,
  make_portfolio_from_PCA,
  simulatorAnalysis
};
