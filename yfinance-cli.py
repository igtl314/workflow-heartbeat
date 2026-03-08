#!/usr/bin/env python3
"""
yfinance CLI - Command-line interface for Yahoo Finance data
This tool provides easy access to financial data via the yfinance library.
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
try:
    import yfinance as yf
except ImportError:
    print("Error: yfinance is not installed. Run: pip install yfinance", file=sys.stderr)
    sys.exit(1)


def get_ticker_info(ticker_symbol, output_format='json'):
    """Get general information about a ticker."""
    ticker = yf.Ticker(ticker_symbol)
    info = ticker.info

    if output_format == 'json':
        print(json.dumps(info, indent=2, default=str))
    else:
        print(f"Ticker: {ticker_symbol}")
        for key, value in info.items():
            print(f"  {key}: {value}")


def get_historical_data(ticker_symbol, period='1mo', interval='1d', output_format='json'):
    """Get historical price data for a ticker."""
    ticker = yf.Ticker(ticker_symbol)
    history = ticker.history(period=period, interval=interval)

    if output_format == 'json':
        # Convert DataFrame to dict and then to JSON
        result = history.reset_index().to_dict(orient='records')
        print(json.dumps(result, indent=2, default=str))
    else:
        print(history)


def get_current_price(ticker_symbol, output_format='json'):
    """Get current price for a ticker."""
    ticker = yf.Ticker(ticker_symbol)
    data = ticker.history(period='1d', interval='1m')

    if len(data) > 0:
        current_price = data['Close'].iloc[-1]
        if output_format == 'json':
            print(json.dumps({
                'ticker': ticker_symbol,
                'price': float(current_price),
                'timestamp': str(data.index[-1])
            }, indent=2))
        else:
            print(f"{ticker_symbol}: ${current_price:.2f}")
    else:
        print(f"Error: No data available for {ticker_symbol}", file=sys.stderr)
        sys.exit(1)


def get_financials(ticker_symbol, statement_type='income', output_format='json'):
    """Get financial statements (income, balance, cashflow)."""
    ticker = yf.Ticker(ticker_symbol)

    if statement_type == 'income':
        data = ticker.financials
    elif statement_type == 'balance':
        data = ticker.balance_sheet
    elif statement_type == 'cashflow':
        data = ticker.cashflow
    else:
        print(f"Error: Invalid statement type: {statement_type}", file=sys.stderr)
        sys.exit(1)

    if output_format == 'json':
        result = data.to_dict(orient='index')
        print(json.dumps(result, indent=2, default=str))
    else:
        print(data)


def get_dividends(ticker_symbol, output_format='json'):
    """Get dividend history for a ticker."""
    ticker = yf.Ticker(ticker_symbol)
    dividends = ticker.dividends

    if output_format == 'json':
        result = dividends.reset_index().to_dict(orient='records')
        print(json.dumps(result, indent=2, default=str))
    else:
        print(dividends)


def get_splits(ticker_symbol, output_format='json'):
    """Get stock split history for a ticker."""
    ticker = yf.Ticker(ticker_symbol)
    splits = ticker.splits

    if output_format == 'json':
        result = splits.reset_index().to_dict(orient='records')
        print(json.dumps(result, indent=2, default=str))
    else:
        print(splits)


def get_recommendations(ticker_symbol, output_format='json'):
    """Get analyst recommendations for a ticker."""
    ticker = yf.Ticker(ticker_symbol)
    recommendations = ticker.recommendations

    if recommendations is not None:
        if output_format == 'json':
            result = recommendations.reset_index().to_dict(orient='records')
            print(json.dumps(result, indent=2, default=str))
        else:
            print(recommendations)
    else:
        print(f"No recommendations available for {ticker_symbol}")


def get_options(ticker_symbol, expiration_date=None, output_format='json'):
    """Get options data for a ticker."""
    ticker = yf.Ticker(ticker_symbol)

    # Get available expiration dates
    expirations = ticker.options

    if not expirations:
        print(f"No options available for {ticker_symbol}", file=sys.stderr)
        return

    # Use provided date or first available
    exp_date = expiration_date if expiration_date else expirations[0]

    if exp_date not in expirations:
        print(f"Error: Expiration date {exp_date} not available.", file=sys.stderr)
        print(f"Available dates: {', '.join(expirations)}", file=sys.stderr)
        sys.exit(1)

    # Get options chain
    opt = ticker.option_chain(exp_date)

    if output_format == 'json':
        result = {
            'expiration': exp_date,
            'calls': opt.calls.to_dict(orient='records'),
            'puts': opt.puts.to_dict(orient='records')
        }
        print(json.dumps(result, indent=2, default=str))
    else:
        print(f"\n=== Options for {ticker_symbol} expiring {exp_date} ===\n")
        print("CALLS:")
        print(opt.calls)
        print("\nPUTS:")
        print(opt.puts)


def main():
    parser = argparse.ArgumentParser(
        description='yfinance CLI - Access Yahoo Finance data from command line',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Get current price
  %(prog)s price AAPL

  # Get historical data for the past year
  %(prog)s history AAPL --period 1y --interval 1d

  # Get company information
  %(prog)s info TSLA

  # Get financial statements
  %(prog)s financials MSFT --type income

  # Get dividends
  %(prog)s dividends KO

  # Get analyst recommendations
  %(prog)s recommendations GOOGL

  # Get options data
  %(prog)s options SPY --expiration 2024-12-20
        """
    )

    parser.add_argument('--format', choices=['json', 'text'], default='json',
                        help='Output format (default: json)')

    subparsers = parser.add_subparsers(dest='command', help='Command to execute')

    # Price command
    price_parser = subparsers.add_parser('price', help='Get current price')
    price_parser.add_argument('ticker', help='Ticker symbol (e.g., AAPL)')

    # History command
    history_parser = subparsers.add_parser('history', help='Get historical data')
    history_parser.add_argument('ticker', help='Ticker symbol')
    history_parser.add_argument('--period', default='1mo',
                                help='Period: 1d,5d,1mo,3mo,6mo,1y,2y,5y,10y,ytd,max (default: 1mo)')
    history_parser.add_argument('--interval', default='1d',
                                help='Interval: 1m,2m,5m,15m,30m,60m,90m,1h,1d,5d,1wk,1mo,3mo (default: 1d)')

    # Info command
    info_parser = subparsers.add_parser('info', help='Get ticker information')
    info_parser.add_argument('ticker', help='Ticker symbol')

    # Financials command
    financials_parser = subparsers.add_parser('financials', help='Get financial statements')
    financials_parser.add_argument('ticker', help='Ticker symbol')
    financials_parser.add_argument('--type', choices=['income', 'balance', 'cashflow'],
                                   default='income', help='Statement type (default: income)')

    # Dividends command
    dividends_parser = subparsers.add_parser('dividends', help='Get dividend history')
    dividends_parser.add_argument('ticker', help='Ticker symbol')

    # Splits command
    splits_parser = subparsers.add_parser('splits', help='Get stock split history')
    splits_parser.add_argument('ticker', help='Ticker symbol')

    # Recommendations command
    rec_parser = subparsers.add_parser('recommendations', help='Get analyst recommendations')
    rec_parser.add_argument('ticker', help='Ticker symbol')

    # Options command
    options_parser = subparsers.add_parser('options', help='Get options data')
    options_parser.add_argument('ticker', help='Ticker symbol')
    options_parser.add_argument('--expiration', help='Expiration date (YYYY-MM-DD)')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        if args.command == 'price':
            get_current_price(args.ticker, args.format)
        elif args.command == 'history':
            get_historical_data(args.ticker, args.period, args.interval, args.format)
        elif args.command == 'info':
            get_ticker_info(args.ticker, args.format)
        elif args.command == 'financials':
            get_financials(args.ticker, args.type, args.format)
        elif args.command == 'dividends':
            get_dividends(args.ticker, args.format)
        elif args.command == 'splits':
            get_splits(args.ticker, args.format)
        elif args.command == 'recommendations':
            get_recommendations(args.ticker, args.format)
        elif args.command == 'options':
            get_options(args.ticker, args.expiration, args.format)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
