module.exports = {
    TABLES: {
        STOCK_PRICES: 'stock_prices',
        USERS: 'users',
        PORTFOLIOS: 'portfolios',
        PORTFOLIO_HOLDINGS: 'portfolio_holdings',
        TRANSACTIONS: 'transactions'
    },
    lstIXIC: [
        'AAPL', 'AMAT', 'AMGN', 'CMCSA', 'INTC', 'KLAC', 
        'PCAR', 'CTAS', 'PAYX', 'LRCX', 'ADSK', 'ROST', 
        'MNST', 'MSFT', 'ADBE', 'FAST', 'EA', 'CSCO', 
        'REGN', 'IDXX', 'VRTX', 'BIIB', 'ODFL', 'QCOM', 
        'GILD', 'SNPS', 'SBUX', 'INTU', 'MCHP', 'ORLY', 
        'COST', 'CPRT', 'DLTR', 'ASML', 'ANSS', 'TTWO', 
        'AMZN', 'CTSH', 'CSGP', 'NVDA', 'BKNG', 'ON', 'ISRG', 
        'MRVL', 'ILMN', 'ADI', 'AEP', 'AMD', 'ADP', 'AZN', 
        'CDNS', 'CSX', 'HON', 'MAR', 'MU', 'XEL', 'EXC', 
        'PEP', 'ROP', 'TXN', 'MDLZ', 'NFLX', 'GOOGL', 'DXCM', 
        'SMCI', 'TMUS', 'LULU', 'MELI', 'KDP', 'AVGO', 'VRSK', 
        'FTNT', 'CHTR', 'TSLA', 'NXPI', 'FANG', 'META', 'PANW', 
        'WDAY', 'CDW', 'GOOG', 'PYPL', 'KHC', 'TEAM', 'CCEP', 
        'TTD', 'BKR', 'MDB', 'ZS', 'PDD', 'MRNA', 'WBD', 'LIN', '^IXIC'
    ],
    interest_rate: 0.02,
    simStartDay: '2024-09-03', 
    initialSimCash: 100000,
    numDaysToSimulate: 55
};
