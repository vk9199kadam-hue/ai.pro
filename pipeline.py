import os
import json
import sys
from viral_detector import extract_video_id, get_youtube_transcript, format_transcript_for_ai, detect_viral_moments
from video_editor import download_clip_slice, convert_to_vertical_reel

def process_video_to_shorts(youtube_url: str, output_dir: str = "output"):
    os.makedirs(output_dir, exist_ok=True)
    video_id = extract_video_id(youtube_url)
    
    print(f"\n==================================================")
    print(f"🎬 PROCESSING YOUTUBE VIDEO: {youtube_url}")
    print(f"==================================================")
    
    # Step 1: Transcript Extraction (Takes 1-2 seconds, 0 bytes video downloaded)
    print("\n[Step 1/3] 📝 Fetching transcript from YouTube...")
    raw_transcript = get_youtube_transcript(video_id)
    if not raw_transcript:
        print("❌ Error: Could not fetch transcript for this video.")
        return None
        
    formatted = format_transcript_for_ai(raw_transcript)
    print(f"✅ Transcript fetched successfully ({len(raw_transcript)} segments, {len(formatted)} characters).")
    
    # Step 2: AI Viral Moment Detection using Gemini Flash (Takes ~2-3 seconds)
    print("\n[Step 2/3] 🤖 Calling Gemini Flash to detect viral moments...")
    analysis = detect_viral_moments(formatted, num_clips=3)
    clips = analysis.get("clips", [])
    
    print(f"\n🎯 FOUND {len(clips)} VIRAL MOMENTS:")
    for c in clips:
        print(f"  • Clip #{c['clip_number']}: [{c['start_time_formatted']} - {c['end_time_formatted']}] (Viral Score: {c['viral_score']}/100)")
        print(f"    Hook: \"{c['hook_title']}\"")
        print(f"    Quote: \"{c['key_quote']}\"")
        print(f"    Reason: {c['virality_reason']}\n")
    
    if not clips:
        print("❌ No valid clips found.")
        return None
        
    # Step 3: Slicing and Converting the Top Viral Clip
    top_clip = sorted(clips, key=lambda x: x.get('viral_score', 0), reverse=True)[0]
    print(f"⭐ Slicing Top Clip #{top_clip['clip_number']} (Score: {top_clip['viral_score']})...")
    
    raw_slice_path = os.path.join(output_dir, f"slice_{video_id}_{top_clip['clip_number']}.mp4")
    final_reel_path = os.path.join(output_dir, f"reel_{video_id}_{top_clip['clip_number']}.mp4")
    
    # Download ONLY the 30-45 sec segment (10-15 MB instead of 2 GB!)
    download_clip_slice(
        video_url=youtube_url,
        start_sec=top_clip['start_time_seconds'],
        end_sec=top_clip['end_time_seconds'],
        raw_output_path=raw_slice_path
    )
    
    # Convert to 9:16 vertical Short/Reel with blurred podcast background
    convert_to_vertical_reel(
        input_video_path=raw_slice_path,
        output_reel_path=final_reel_path,
        layout="blurred_fill"
    )
    
    print(f"\n==================================================")
    print(f"🎉 SUCCESS! YOUR VIRAL REEL IS READY:")
    print(f"📁 Path: {os.path.abspath(final_reel_path)}")
    print(f"==================================================")
    
    return {
        "clips_metadata": clips,
        "selected_clip": top_clip,
        "output_file": os.path.abspath(final_reel_path)
    }

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=UF8uR6Z6KLc"
    process_video_to_shorts(url)

