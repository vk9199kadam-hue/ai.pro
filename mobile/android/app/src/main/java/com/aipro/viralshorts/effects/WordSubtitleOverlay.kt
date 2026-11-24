package com.aipro.viralshorts.effects

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import org.json.JSONArray
import org.json.JSONObject

/**
 * WordSubtitleOverlay
 * Renders dynamic, word-by-word synchronized animated subtitles with drop shadows onto the video frame canvas.
 */
class WordSubtitleOverlay(
    private val width: Int = 1080,
    private val height: Int = 1920,
    private val style: String = "hype_yellow"
) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = 64f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
    }

    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = 64f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
        color = Color.BLACK
    }

    /**
     * Draws the active subtitle word onto a mutable bitmap at the specified presentation time.
     */
    fun drawFrame(bitmap: Bitmap, currentSec: Float, words: JSONArray) {
        val canvas = Canvas(bitmap)
        val activeWords = mutableListOf<String>()
        var highlightedIndex = -1

        for (i in 0 until words.length()) {
            val wordObj = words.getJSONObject(i)
            val start = wordObj.getDouble("start").toFloat()
            val end = wordObj.getDouble("end").toFloat()
            val text = wordObj.getString("word")

            // Window of words around the current timestamp (phrase mode)
            if (currentSec in (start - 0.5f)..(end + 1.5f)) {
                activeWords.add(text)
                if (currentSec in start..end) {
                    highlightedIndex = activeWords.size - 1
                }
            }
        }

        if (activeWords.isEmpty()) return

        val phrase = activeWords.joinToString(" ")
        val textY = height * 0.75f // Placed in lower 3rd of 9:16 vertical video

        // Draw dropshadow
        canvas.drawText(phrase, width / 2f + 4f, textY + 4f, shadowPaint)

        // Draw base text (Hype Yellow or Clean White)
        if (style == "hype_yellow") {
            paint.color = Color.parseColor("#FFE600")
        } else {
            paint.color = Color.WHITE
        }

        canvas.drawText(phrase, width / 2f, textY, paint)
    }
}

