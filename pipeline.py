import os
import json
import sys
from viral_detector import extract_video_id, get_youtube_transcript, format_transcript_for_ai, detect_viral_moments
from video_editor import download_clip_slice, convert_to_vertical_reel

def process_video_to_shorts(youtube_url: str, output_dir: str = "output", num_clips: int = 6, render_count: int = 1):
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
    print(f"\n[Step 2/3] 🤖 Calling Gemini Flash to detect top {num_clips} viral moments...")
    analysis = detect_viral_moments(formatted, num_clips=num_clips)
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
        
    # Save clips metadata to JSON
    meta_path = os.path.join(output_dir, f"viral_clips_{video_id}.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(analysis, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved clips metadata to: {meta_path}")

    # Step 3: Slicing and Converting the Top Viral Clips
    sorted_clips = sorted(clips, key=lambda x: x.get('viral_score', 0), reverse=True)
    clips_to_render = sorted_clips[:render_count]
    
    rendered_outputs = []
    for idx, clip in enumerate(clips_to_render, 1):
        print(f"\n⭐ [{idx}/{len(clips_to_render)}] Slicing & Rendering Clip #{clip['clip_number']} (Score: {clip['viral_score']}): \"{clip['hook_title']}\"...")
        
        raw_slice_path = os.path.join(output_dir, f"slice_{video_id}_clip{clip['clip_number']}.mp4")
        final_reel_path = os.path.join(output_dir, f"reel_{video_id}_clip{clip['clip_number']}.mp4")
        
        # Download ONLY the segment (10-15 MB instead of 2 GB!)
        actual_slice_path = download_clip_slice(
            video_url=youtube_url,
            start_sec=clip['start_time_seconds'],
            end_sec=clip['end_time_seconds'],
            raw_output_path=raw_slice_path
        )
        
        # Convert to 9:16 vertical Short/Reel with blurred podcast background
        convert_to_vertical_reel(
            input_video_path=actual_slice_path,
            output_reel_path=final_reel_path,
            layout="blurred_fill"
        )
        
        rendered_outputs.append({
            "clip": clip,
            "output_file": os.path.abspath(final_reel_path)
        })
        
        print(f"🎉 Clip #{clip['clip_number']} ready at: {os.path.abspath(final_reel_path)}")
    
    print(f"\n==================================================")
    print(f"🎉 ALL REQUESTED SHORTS ARE READY!")
    for out in rendered_outputs:
        print(f"📁 [{out['clip']['viral_score']}/100] {out['output_file']}")
    print(f"==================================================")
    
    return {
        "clips_metadata": clips,
        "rendered_clips": rendered_outputs
    }

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://youtu.be/SzyT-CdeDQQ?si=tSNxQBcXBqgVgbFO"
    num_clips_arg = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    render_count_arg = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    process_video_to_shorts(url, num_clips=num_clips_arg, render_count=render_count_arg)
