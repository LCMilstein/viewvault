#!/usr/bin/env python3
"""
Progress Tracker for ViewVault

This module tracks actual import performance and uses historical data to improve
progress bar predictions. It learns from real import times to provide more accurate
estimates for future imports.
"""

import json
import os
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional
import statistics

class ProgressTracker:
    def __init__(self, data_file: str = "progress_data.json"):
        self.data_file = data_file
        self.import_history = self._load_history()
        
    def _load_history(self) -> Dict:
        """Load historical import performance data"""
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                pass
        return {
            "imports": [],
            "statistics": {
                "avg_time_per_item": 0.15,  # Default: 0.15s per item
                "avg_collection_time": 0.8,  # Default: 0.8s per collection
                "min_total_time": 3.0,       # Minimum 3 seconds
                "samples": 0
            }
        }
    
    def _save_history(self):
        """Save historical data to file"""
        try:
            with open(self.data_file, 'w') as f:
                json.dump(self.import_history, f, indent=2)
        except IOError as e:
            print(f"Warning: Could not save progress data: {e}")
    
    def start_import(self, library_name: str, total_movies: int, total_collections: int) -> str:
        """Start tracking a new import operation"""
        import_id = f"{int(time.time())}_{library_name}"
        
        self.import_history["imports"].append({
            "id": import_id,
            "library_name": library_name,
            "total_movies": total_movies,
            "total_collections": total_collections,
            "start_time": time.time(),
            "completed": False,
            "actual_time": None,
            "predicted_time": self._predict_import_time(total_movies, total_collections)
        })
        
        self._save_history()
        return import_id
    
    def complete_import(self, import_id: str):
        """Mark an import as completed and update statistics"""
        for import_record in self.import_history["imports"]:
            if import_record["id"] == import_id:
                import_record["completed"] = True
                import_record["actual_time"] = time.time() - import_record["start_time"]
                
                # Update statistics if we have enough data
                self._update_statistics()
                self._save_history()
                break
    
    def _predict_import_time(self, total_movies: int, total_collections: int) -> float:
        """Predict total import time based on historical data"""
        stats = self.import_history["statistics"]
        
        # Calculate predicted time
        movie_time = total_movies * stats["avg_time_per_item"]
        collection_time = total_collections * stats["avg_collection_time"]
        predicted_time = movie_time + collection_time
        
        # Ensure minimum time
        return max(stats["min_total_time"], predicted_time)
    
    def _update_statistics(self):
        """Update performance statistics based on completed imports"""
        completed_imports = [imp for imp in self.import_history["imports"] if imp["completed"]]
        
        if len(completed_imports) < 3:  # Need at least 3 samples for meaningful stats
            return
        
        # Calculate average time per item
        times_per_item = []
        times_per_collection = []
        
        for imp in completed_imports[-10:]:  # Use last 10 imports for recent performance
            if imp["actual_time"] and imp["total_movies"] > 0:
                time_per_item = imp["actual_time"] / imp["total_movies"]
                times_per_item.append(time_per_item)
            
            if imp["actual_time"] and imp["total_collections"] > 0:
                time_per_collection = imp["actual_time"] / imp["total_collections"]
                times_per_collection.append(time_per_collection)
        
        if times_per_item:
            self.import_history["statistics"]["avg_time_per_item"] = statistics.mean(times_per_item)
        
        if times_per_collection:
            self.import_history["statistics"]["avg_collection_time"] = statistics.mean(times_per_collection)
        
        self.import_history["statistics"]["samples"] = len(completed_imports)
    
    def get_progress_timeline(self, import_id: str, total_work: int) -> Dict:
        """Get a timeline for progress bar animation based on predicted completion"""
        for import_record in self.import_history["imports"]:
            if import_record["id"] == import_id:
                predicted_time = import_record["predicted_time"]
                
                # Create a smooth timeline that reaches 95% at predicted completion
                # and 100% shortly after
                timeline = {
                    "total_time": predicted_time,
                    "target_95_percent": predicted_time * 0.95,
                    "target_100_percent": predicted_time * 1.1,  # 10% buffer
                    "smooth_progression": True
                }
                
                return timeline
        
        # Fallback to default timeline
        return {
            "total_time": max(3.0, total_work * 0.15),
            "target_95_percent": max(2.85, total_work * 0.1425),
            "target_100_percent": max(3.3, total_work * 0.165),
            "smooth_progression": True
        }
    
    def get_performance_summary(self) -> Dict:
        """Get a summary of import performance for debugging"""
        completed = [imp for imp in self.import_history["imports"] if imp["completed"]]
        recent = completed[-5:] if len(completed) >= 5 else completed
        
        return {
            "total_imports_tracked": len(self.import_history["imports"]),
            "completed_imports": len(completed),
            "recent_performance": [
                {
                    "library": imp["library_name"],
                    "movies": imp["total_movies"],
                    "collections": imp["total_collections"],
                    "predicted_time": round(imp["predicted_time"], 2),
                    "actual_time": round(imp["actual_time"], 2) if imp["actual_time"] else None,
                    "accuracy": round((imp["predicted_time"] / imp["actual_time"] * 100), 1) if imp["actual_time"] else None
                } for imp in recent
            ],
            "current_statistics": self.import_history["statistics"]
        }

# Global instance
progress_tracker = ProgressTracker()
