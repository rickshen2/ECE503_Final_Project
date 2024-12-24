CREATE TABLE users (
    UserID INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(255) UNIQUE NOT NULL,
    Password VARCHAR(255) NOT NULL
);

INSERT INTO users (Username, Password) VALUES
('rds260', 'ECE503'),
('qo5', 'ECE503');
ALTER TABLE users ADD COLUMN trendFollowingEnabled BOOLEAN DEFAULT FALSE;


CREATE TABLE Portfolios (
    PortfolioID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT,
    TotalValue DECIMAL(15, 2),
    PortfolioType ENUM('cash', 'manual', 'strategic', 'algorithmic'),
    modDate DATE,
    FOREIGN KEY (UserID) REFERENCES users(UserID)
);

ALTER TABLE Portfolios AUTO_INCREMENT = 3;

INSERT INTO portfolios (UserID, TotalValue, PortfolioType, modDate) VALUES
(1, 100000, 'cash', '2024-10-01'),
(2, 100000, 'cash', '2024-10-01');

CREATE TABLE Portfolio_Holdings (
    HoldingID INT AUTO_INCREMENT PRIMARY KEY,
    PortfolioID INT,
    Ticker VARCHAR(10),
    Quantity INT,
    FOREIGN KEY (PortfolioID) REFERENCES Portfolios(PortfolioID) ON DELETE CASCADE
);


CREATE TABLE Transactions (
    TransactionID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT,
    Ticker VARCHAR(10),
    TransactionType ENUM('buy', 'sell'),
    Quantity INT,
    Price DECIMAL(15, 2),
    Date DATE,
    FOREIGN KEY (UserID) REFERENCES users(UserID)
);


CREATE TABLE stock_prices (
    StockID INT AUTO_INCREMENT PRIMARY KEY,
    Date DATE,
    Ticker VARCHAR(10),
    Price DECIMAL(15, 2)
);

FOREIGN KEY (PortfolioID) REFERENCES Portfolios(PortfolioID) ON DELETE CASCADE

CREATE TABLE Portfolio_Value_History (
    HistoryID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT,
    PortfolioID INT,
    Date DATE,
    TotalValue DECIMAL(15, 2),
    FOREIGN KEY (UserID) REFERENCES users(UserID),
    FOREIGN KEY (PortfolioID) REFERENCES Portfolios(PortfolioID)
);