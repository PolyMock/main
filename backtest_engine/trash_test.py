import duckdb
from glob import glob
import pandas as pd

# Get all parquet files
trade_files = sorted(glob("/Volumes/Extreme SSD/prediction-market-data/data/polymarket/standardized_trades/*.parquet"))

if trade_files:
    con = duckdb.connect()
    sorted_count = 0
    unsorted_count = 0
    
    print("Checking if files are sorted by timestamp...\n")
    
    file_stats = []  # Store min/max timestamp for each file
    
    for file_path in trade_files:
        file_name = file_path.split('/')[-1]
        try:
            df = con.execute(f"SELECT timestamp FROM '{file_path}'").df()
            
            if len(df) > 0:
                is_sorted = df["timestamp"].is_monotonic_increasing
                status = "✓ SORTED" if is_sorted else "✗ NOT SORTED"
                sorted_count += 1 if is_sorted else 0
                unsorted_count += 0 if is_sorted else 1
                
                # Store min and max timestamps for cross-file checking
                min_ts = df["timestamp"].min()
                max_ts = df["timestamp"].max()
                file_stats.append((file_name, min_ts, max_ts))
                
                print(f"{file_name}: {status}")
            else:
                print(f"{file_name}: EMPTY FILE")
        except Exception as e:
            print(f"{file_name}: ERROR - {e}")
    
    print(f"\n--- INTRA-FILE SUMMARY ---")
    print(f"Sorted files:     {sorted_count}")
    print(f"Unsorted files:   {unsorted_count}")
    print(f"Total files:      {len(trade_files)}")
    print(f"Can skip sorting? {unsorted_count == 0}")
    
    # Check if files are chronologically sorted relative to each other
    print(f"\n--- CROSS-FILE CHRONOLOGICAL ORDER ---\n")
    cross_file_sorted = True
    for i in range(len(file_stats) - 1):
        current_file, current_min, current_max = file_stats[i]
        next_file, next_min, next_max = file_stats[i + 1]
        
        is_ordered = current_max < next_min
        status = "✓ ORDERED" if is_ordered else "✗ OVERLAPPING"
        cross_file_sorted = cross_file_sorted and is_ordered
        
        print(f"{current_file} → {next_file}: {status}")
        if not is_ordered:
            print(f"  {current_file} max: {current_max}")
            print(f"  {next_file} min: {next_min}")
    
    print(f"\n--- CROSS-FILE SUMMARY ---")
    print(f"Files chronologically ordered? {cross_file_sorted}")
else:
    print("No parquet files found")