const express = require('express');
const cors = require('cors');
const mysql = require('mysql');
const path = require('path');
const session = require('express-session');
const { interest_rate, simStartDay } = require('./config');
const { PortfolioAnalysis, StockAnalysis, simulatorAnalysis } = require('./utility');

const app = express();
app.use(cors());
app.use(express.static('public', { index: 'login.html'}));  // Serve static HTML files, including index.html
app.use(express.json());  // Parse JSON requests
app.use(session({
  secret: 'yourSecret',  // Secret key for session
  resave: false,
  saveUninitialized: true,
}));

// MySQL Database Connection
const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',  // Replace with your MySQL username
  password: 'client_password',  // Replace with your MySQL password
  database: 'stock_data',
});

db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL Database.');
});

// Login API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const query = 'SELECT * FROM users WHERE Username = ? AND Password = ?';
  db.query(query, [username, password], (err, results) => {
    if (err) {
      console.error('Error querying the database:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }

    if (results.length > 0) {
      const user = results[0];
      req.session.username = user.Username;
      req.session.userID = user.UserID;

      // Send user information and other data (e.g., simStartDay, interest rate)
      res.json({
        success: true,
        username: user.Username,
        userID: user.UserID,
        simStartDay,
        interestRate: interest_rate,
      });
    } else {
      res.json({ success: false, message: 'Invalid username or password' });
    }
  });
});


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to get the portfolio summary
app.get('/api/portfolio-summary', (req, res) => {
  try {
    // Instantiate PortfolioAnalysis for each portfolio type with portfolio_history.csv
    const cashPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Cash');
    const manualPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Manual');
    const algorithmicPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Algorithmic');
    const strategicPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Strategic');
    const cashStrategicPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Cash+Strategic');
    const totalPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Total');
    
    // Prepare the summary data to send to the client
    const summaryData = {
      cash: {
        date: cashPortfolio.date,
        dailyVal: cashPortfolio.dailyVal[cashPortfolio.dailyVal.length - 1].toFixed(2),
        dailyChange: cashPortfolio.dailyChange[cashPortfolio.dailyChange.length - 1].toFixed(2),
        percChange: cashPortfolio.percChange[cashPortfolio.percChange.length - 1].toFixed(2),
        ytdChange: cashPortfolio.ytdChange.toFixed(2),
        ytdPercChange: cashPortfolio.ytdPercChange.toFixed(2),
      },
      manual: {
        date: manualPortfolio.date,
        dailyVal: manualPortfolio.dailyVal[manualPortfolio.dailyVal.length - 1].toFixed(2),
        dailyChange: manualPortfolio.dailyChange[manualPortfolio.dailyChange.length - 1].toFixed(2),
        percChange: manualPortfolio.percChange[manualPortfolio.percChange.length - 1].toFixed(2),
        ytdChange: manualPortfolio.ytdChange.toFixed(2),
        ytdPercChange: manualPortfolio.ytdPercChange.toFixed(2),
      },
      algorithmic: {
        date: algorithmicPortfolio.date,
        dailyVal: algorithmicPortfolio.dailyVal[algorithmicPortfolio.dailyVal.length - 1].toFixed(2),
        dailyChange: algorithmicPortfolio.dailyChange[algorithmicPortfolio.dailyChange.length - 1].toFixed(2),
        percChange: algorithmicPortfolio.percChange[algorithmicPortfolio.percChange.length - 1].toFixed(2),
        ytdChange: algorithmicPortfolio.ytdChange.toFixed(2),
        ytdPercChange: algorithmicPortfolio.ytdPercChange.toFixed(2),
      },
      strategic: {
        date: strategicPortfolio.date,
        dailyVal: strategicPortfolio.dailyVal[strategicPortfolio.dailyVal.length - 1].toFixed(2),
        dailyChange: strategicPortfolio.dailyChange[strategicPortfolio.dailyChange.length - 1].toFixed(2),
        percChange: strategicPortfolio.percChange[strategicPortfolio.percChange.length - 1].toFixed(2),
        ytdChange: strategicPortfolio.ytdChange.toFixed(2),
        ytdPercChange: strategicPortfolio.ytdPercChange.toFixed(2),
      },
      cashstrategic: {
        date: cashStrategicPortfolio.date,
        dailyVal: cashStrategicPortfolio.dailyVal[cashStrategicPortfolio.dailyVal.length - 1].toFixed(2),
        dailyChange: cashStrategicPortfolio.dailyChange[cashStrategicPortfolio.dailyChange.length - 1].toFixed(2),
        percChange: cashStrategicPortfolio.percChange[cashStrategicPortfolio.percChange.length - 1].toFixed(2),
        ytdChange: cashStrategicPortfolio.ytdChange.toFixed(2),
        ytdPercChange: cashStrategicPortfolio.ytdPercChange.toFixed(2),
      },
      total: {
        date: totalPortfolio.date,
        dailyVal: totalPortfolio.dailyVal[totalPortfolio.dailyVal.length - 1].toFixed(2),
        dailyChange: totalPortfolio.dailyChange[totalPortfolio.dailyChange.length - 1].toFixed(2),
        percChange: totalPortfolio.percChange[totalPortfolio.percChange.length - 1].toFixed(2),
        ytdChange: totalPortfolio.ytdChange.toFixed(2),
        ytdPercChange: totalPortfolio.ytdPercChange.toFixed(2)
      },
    };

    // Send the response
    res.json(summaryData);
  } catch (error) {
    console.error('Error processing portfolio data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Static Pages
app.get('/summary', (req, res) => {
  if (!req.session.username) {
    return res.redirect('/login'); // Redirect to login if not authenticated
  }
  res.sendFile(path.join(__dirname, 'public', 'summary.html'));
});

// cash page
app.get('/cash', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cash.html'));
});

app.get('/api/cash', (req, res) => {
  try {
    const cashPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Cash');
    const plotData = {
      cash: {
        date: cashPortfolio.date,
        dailyVal: cashPortfolio.dailyVal,
        dailyChange: cashPortfolio.dailyChange,
        percChange: cashPortfolio.percChange,
        ytdChange: cashPortfolio.ytdChange,
        ytdPercChange: cashPortfolio.ytdPercChange,
      },
    };
    // Send the response
    res.json(plotData);
  } catch (error) {
    console.error('Error processing cash data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// manual page
app.get('/manual', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manual.html'));
});

app.get('/api/manual', (req, res) => {
  try {
    const manualPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Manual');
    const plotData = {
      manual: {
        date: manualPortfolio.date,
        dailyVal: manualPortfolio.dailyVal,
        dailyChange: manualPortfolio.dailyChange,
        percChange: manualPortfolio.percChange,
        ytdChange: manualPortfolio.ytdChange,
        ytdPercChange: manualPortfolio.ytdPercChange,
      },
    };
    // Send the response
    res.json(plotData);
  } catch (error) {
    console.error('Error processing manual data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// fetch manual portfolio holdings
app.get('/api/manual/holdings', (req, res) => {
  const query = `
    SELECT 
      ph.Ticker, ph.Quantity 
    FROM 
      portfolios p
    INNER JOIN 
      portfolio_holdings ph ON p.PortfolioID = ph.PortfolioID
    WHERE 
      p.PortfolioType = 'Manual';
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error querying manual portfolio holdings:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    // Send the fetched data as JSON
    res.json({ holdings: results });
  });
});


// strategic portfolio
app.get('/strategic', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'strategic.html'));
});

app.get('/api/strategic', (req, res) => {
  try {
    const strategicPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Cash+Strategic');
    const plotData = {
      strategic: {
        date: strategicPortfolio.date,
        dailyVal: strategicPortfolio.dailyVal,
        dailyChange: strategicPortfolio.dailyChange,
        percChange: strategicPortfolio.percChange,
        ytdChange: strategicPortfolio.ytdChange,
        ytdPercChange: strategicPortfolio.ytdPercChange,
      },
    };
    // Send the response
    res.json(plotData);
  } catch (error) {
    console.error('Error processing strategic data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// fetch strategic portfolio holdings
app.get('/api/strategic/holdings', (req, res) => {
  const query = `
    SELECT 
      ph.Ticker, ph.Quantity 
    FROM 
      portfolios p
    INNER JOIN 
      portfolio_holdings ph ON p.PortfolioID = ph.PortfolioID
    WHERE 
      p.PortfolioType = 'Strategic';
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error querying strategic portfolio holdings:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    // Send the fetched data as JSON
    res.json({ holdings: results });
  });
});

app.get('/algorithmic', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'algorithmic.html'));
});

app.get('/api/algorithmic', (req, res) => {
  try {
    const algorPortfolio = new PortfolioAnalysis('./output/portfolio_history.csv', 'Algorithmic');
    const plotData = {
      algor: {
        date: algorPortfolio.date,
        dailyVal: algorPortfolio.dailyVal,
        dailyChange: algorPortfolio.dailyChange,
        percChange: algorPortfolio.percChange,
        ytdChange: algorPortfolio.ytdChange,
        ytdPercChange: algorPortfolio.ytdPercChange,
      },
    };
    // Send the response
    res.json(plotData);
  } catch (error) {
    console.error('Error processing algorithmic data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// fetch algorithmic portfolio holdings
app.get('/api/algorithmic/holdings', (req, res) => {
  const query = `
    SELECT 
      ph.Ticker, ph.Quantity 
    FROM 
      portfolios p
    INNER JOIN 
      portfolio_holdings ph ON p.PortfolioID = ph.PortfolioID
    WHERE 
      p.PortfolioType = 'Algorithmic';
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error querying algorithmic portfolio holdings:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    // Send the fetched data as JSON
    res.json({ holdings: results });
  });
});



// research page
app.get('/research', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'research.html'));
});

app.post('/api/research', async (req, res) => {
  const { stockSymbol, startDate, endDate, currentDate } = req.body;
  // console.log(req.body);
  try {
      const result = await simulatorAnalysis([stockSymbol], startDate, endDate, currentDate); 
      // console.log(result);
      res.json(result);
  } catch (error) {
      console.error('Error analyzing stock:', error.message);
      res.status(500).json({ error: 'Failed to analyze stock data' });
  }
});

// trade page
app.get('/trade', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trade.html'));
});

app.post('/api/trade', async (req, res) => {
  const { userID, symbol, quantity, currentDate, type } = req.body;
  try {
      const result = await tradeStock(userID, symbol, quantity, currentDate, type);
      res.json(result);
  } catch (error) {
      console.error('Error executing trade:', error.message);
      res.status(500).json({ error: 'Failed to execute trade' });
  }
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {``
  console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = app; 