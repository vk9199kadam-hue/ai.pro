package com.aipro.viralshorts

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.annotation.OptIn
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.CanvasOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import kotlin.math.max
import kotlin.math.min

@OptIn(UnstableApi::class)
class VideoRendererModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun getName(): String = "VideoRendererModule"

    data class WordItem(
        val word: String,
        val start: Double,
        val end: Double
    )

    @ReactMethod
    fun renderClip(manifestJson: String, promise: Promise) {
        try {
            val manifest = JSONObject(manifestJson)
            val sourceUrl = manifest.getString("source_url")
            val trimStartSec = manifest.optDouble("trim_start", 0.0)
            val trimEndSec = manifest.optDouble("trim_end", 0.0)
            val targetWidth = manifest.optInt("target_width", 1080)
            val targetHeight = manifest.optInt("target_height", 1920)
            val layoutMode = manifest.optString("layout", "blurred_fill")
            val captionStyle = manifest.optString("caption_style", "hype_yellow")
            val captionsEnabled = manifest.optBoolean("captions_enabled", true)
            val hookEnabled = manifest.optBoolean("hook_enabled", true)
            val hookText = stripEmojis(manifest.optString("hook_text", ""))
            val watermarkEnabled = manifest.optBoolean("watermark_enabled", true)
            val watermarkRaw = manifest.optString("watermark_text", "").ifBlank {
                manifest.optString("creator_tag", "")
            }
            val watermarkText = stripEmojis(watermarkRaw)
            val watermarkPosition = manifest.optString("watermark_position", "bottom_right")
            val logoUri = manifest.optString("logo_uri", "")
            val logoBitmap = loadLogoBitmap(logoUri)

            // Parse words array & normalize relative to trim_start
            val wordsList = mutableListOf<WordItem>()
            val wordsArr = manifest.optJSONArray("words") ?: JSONArray()
            val effectiveDuration = if (trimEndSec > trimStartSec) (trimEndSec - trimStartSec) else 60.0
            for (i in 0 until wordsArr.length()) {
                val wObj = wordsArr.optJSONObject(i) ?: continue
                val cleanWord = stripEmojis(wObj.optString("word", "")).trim()
                if (cleanWord.isEmpty()) continue
                val relStart = max(0.0, wObj.optDouble("start", 0.0) - trimStartSec)
                val relEnd = max(0.0, wObj.optDouble("end", 0.0) - trimStartSec)
                if (relEnd > relStart && relStart < effectiveDuration) {
                    wordsList.add(WordItem(cleanWord, relStart, min(relEnd, effectiveDuration)))
                }
            }

            // Probe source dimensions & generate blurred backdrop bitmap off the UI thread
            val sourceMeta = probeSourceAndBuildBackdrop(sourceUrl, targetWidth, targetHeight, layoutMode)

            val tempOutputFile = File(
                reactContext.cacheDir,
                "render_clip_${System.currentTimeMillis()}.mp4"
            )

            // 1. Configure Slicing via MediaItem.ClippingConfiguration
            val mediaItemBuilder = MediaItem.Builder().setUri(Uri.parse(sourceUrl))
            if (trimEndSec > trimStartSec && trimStartSec >= 0.0) {
                mediaItemBuilder.setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder()
                        .setStartPositionMs((trimStartSec * 1000).toLong())
                        .setEndPositionMs((trimEndSec * 1000).toLong())
                        .build()
                )
            }
            val mediaItem = mediaItemBuilder.build()

            // 2. Configure 9:16 Portrait Canvas Presentation
            val presentationLayout = if (layoutMode == "center_crop") {
                Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP
            } else {
                Presentation.LAYOUT_SCALE_TO_FIT
            }
            val presentationEffect = Presentation.createForWidthAndHeight(
                targetWidth,
                targetHeight,
                presentationLayout
            )

            // 3. Configure CanvasOverlay for Blurred Fill + Hook Banner + Animated Subtitles + Watermark
            val overlay = ClipSnapCanvasOverlay(
                targetWidth = targetWidth,
                targetHeight = targetHeight,
                layoutMode = layoutMode,
                blurredBackdrop = sourceMeta.blurredBackdrop,
                fgRect = sourceMeta.fgRect,
                captionStyle = captionStyle,
                captionsEnabled = captionsEnabled,
                words = wordsList,
                hookEnabled = hookEnabled,
                hookText = hookText,
                watermarkEnabled = watermarkEnabled,
                watermarkText = watermarkText,
                watermarkPosition = watermarkPosition,
                logoBitmap = logoBitmap
            )
            val overlayEffect = OverlayEffect(listOf(overlay))

            val videoEffects: List<Effect> = listOf(presentationEffect, overlayEffect)
            val editedMediaItem = EditedMediaItem.Builder(mediaItem)
                .setEffects(Effects(emptyList(), videoEffects))
                .build()

            // 4. Media3 Transformer MUST be built and started on a Looper thread (Main Thread)
            mainHandler.post {
                try {
                    val transformer = Transformer.Builder(reactContext)
                        .setVideoMimeType(MimeTypes.VIDEO_H264)
                        .setAudioMimeType(MimeTypes.AUDIO_AAC)
                        .addListener(object : Transformer.Listener {
                            override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                                sourceMeta.blurredBackdrop?.recycle()
                                logoBitmap?.recycle()
                                val finalUri = saveToGallery(tempOutputFile)
                                val finalSize = if (tempOutputFile.exists()) tempOutputFile.length() else exportResult.fileSizeBytes
                                tempOutputFile.delete()

                                val result = JSONObject().apply {
                                    put("outputPath", finalUri?.toString() ?: tempOutputFile.absolutePath)
                                    put("savedToGallery", finalUri != null)
                                    put("durationMs", (effectiveDuration * 1000).toLong())
                                    put("width", targetWidth)
                                    put("height", targetHeight)
                                    put("fileSizeBytes", finalSize)
                                }
                                promise.resolve(result.toString())
                            }

                            override fun onError(
                                composition: Composition,
                                exportResult: ExportResult,
                                exportException: ExportException
                            ) {
                                sourceMeta.blurredBackdrop?.recycle()
                                logoBitmap?.recycle()
                                tempOutputFile.delete()
                                promise.reject("RENDER_ERROR", exportException.message, exportException)
                            }
                        })
                        .build()

                    transformer.start(editedMediaItem, tempOutputFile.absolutePath)

                    val progressHolder = ProgressHolder()
                    val progressRunnable = object : Runnable {
                        override fun run() {
                            val progressState = transformer.getProgress(progressHolder)
                            if (progressState == Transformer.PROGRESS_STATE_AVAILABLE) {
                                val params = Arguments.createMap().apply {
                                    putDouble("progress", progressHolder.progress / 100.0)
                                }
                                reactContext
                                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                    .emit("onRenderProgress", params)
                                mainHandler.postDelayed(this, 200)
                            } else if (progressState != Transformer.PROGRESS_STATE_NOT_STARTED) {
                                mainHandler.postDelayed(this, 200)
                            }
                        }
                    }
                    mainHandler.post(progressRunnable)
                } catch (t: Throwable) {
                    sourceMeta.blurredBackdrop?.recycle()
                    tempOutputFile.delete()
                    promise.reject("TRANSFORMER_START_ERROR", t.message, t)
                }
            }
        } catch (e: Exception) {
            promise.reject("INVALID_MANIFEST", e.message, e)
        }
    }

    private data class SourceMeta(
        val fgRect: Rect,
        val blurredBackdrop: Bitmap?
    )

    private fun probeSourceAndBuildBackdrop(
        sourceUrl: String,
        targetWidth: Int,
        targetHeight: Int,
        layoutMode: String
    ): SourceMeta {
        var srcW = 1920
        var srcH = 1080
        var backdrop: Bitmap? = null

        val retriever = MediaMetadataRetriever()
        try {
            val uri = Uri.parse(sourceUrl)
            if (uri.scheme == "file" || uri.scheme == null) {
                retriever.setDataSource(uri.path ?: sourceUrl)
            } else {
                retriever.setDataSource(reactContext, uri)
            }

            val rawW = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 1920
            val rawH = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 1080
            val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            if (rotation == 90 || rotation == 270) {
                srcW = rawH
                srcH = rawW
            } else {
                srcW = rawW
                srcH = rawH
            }

            if (layoutMode == "blurred_fill") {
                val frame = retriever.getFrameAtTime(1_000_000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                    ?: retriever.getFrameAtTime(0L)
                if (frame != null) {
                    backdrop = createBlurredBackdrop(frame, targetWidth, targetHeight)
                    if (frame != backdrop) frame.recycle()
                }
            }
        } catch (_: Throwable) {
            // Fallback to default 16:9 geometry and gradient backdrop
        } finally {
            try {
                retriever.release()
            } catch (_: Throwable) {}
        }

        val scale = min(targetWidth.toFloat() / srcW.toFloat(), targetHeight.toFloat() / srcH.toFloat())
        val drawnW = (srcW * scale).toInt()
        val drawnH = (srcH * scale).toInt()
        val left = (targetWidth - drawnW) / 2
        val top = (targetHeight - drawnH) / 2
        val fgRect = Rect(left, top, left + drawnW, top + drawnH)

        return SourceMeta(fgRect, backdrop)
    }

    /**
     * Fast downscale -> box blur -> upscale for smooth 9:16 bokeh backdrop
     */
    private fun createBlurredBackdrop(source: Bitmap, targetWidth: Int, targetHeight: Int): Bitmap {
        val smallW = 135
        val smallH = 240

        // Center-crop source to 9:16 aspect ratio at low resolution
        val targetAspect = targetWidth.toFloat() / targetHeight.toFloat()
        val srcAspect = source.width.toFloat() / source.height.toFloat()
        val cropRect = if (srcAspect > targetAspect) {
            val cropW = (source.height * targetAspect).toInt()
            val x = (source.width - cropW) / 2
            Rect(x, 0, x + cropW, source.height)
        } else {
            val cropH = (source.width / targetAspect).toInt()
            val y = (source.height - cropH) / 2
            Rect(0, y, source.width, y + cropH)
        }

        val small = Bitmap.createBitmap(smallW, smallH, Bitmap.Config.ARGB_8888)
        val c = Canvas(small)
        c.drawBitmap(source, cropRect, Rect(0, 0, smallW, smallH), Paint(Paint.FILTER_BITMAP_FLAG))

        val blurredSmall = fastBoxBlur(small, radius = 10)
        small.recycle()

        val full = Bitmap.createScaledBitmap(blurredSmall, targetWidth, targetHeight, true)
        blurredSmall.recycle()

        // Apply subtle dark scrim so foreground & captions pop cleanly
        val scrimCanvas = Canvas(full)
        scrimCanvas.drawColor(Color.argb(85, 10, 14, 24))
        return full
    }

    private fun fastBoxBlur(bitmap: Bitmap, radius: Int): Bitmap {
        val w = bitmap.width
        val h = bitmap.height
        val pix = IntArray(w * h)
        bitmap.getPixels(pix, 0, w, 0, 0, w, h)

        val wm = w - 1
        val hm = h - 1
        val wh = w * h
        val div = radius + radius + 1
        val r = IntArray(wh)
        val g = IntArray(wh)
        val b = IntArray(wh)
        val vmin = IntArray(max(w, h))

        var divsum = (div + 1) shr 1
        divsum *= divsum
        val dv = IntArray(256 * divsum)
        for (i in dv.indices) dv[i] = i / divsum

        var yw = 0
        var yi = 0
        val stack = Array(div) { IntArray(3) }
        val r1 = radius + 1

        for (y in 0 until h) {
            var rinsum = 0; var ginsum = 0; var binsum = 0
            var routsum = 0; var goutsum = 0; var boutsum = 0
            var rsum = 0; var gsum = 0; var bsum = 0

            for (i in -radius..radius) {
                val p = pix[yi + min(wm, max(i, 0))]
                val sir = stack[i + radius]
                sir[0] = (p and 0xff0000) shr 16
                sir[1] = (p and 0x00ff00) shr 8
                sir[2] = p and 0x0000ff
                val rbs = r1 - kotlin.math.abs(i)
                rsum += sir[0] * rbs; gsum += sir[1] * rbs; bsum += sir[2] * rbs
                if (i > 0) {
                    rinsum += sir[0]; ginsum += sir[1]; binsum += sir[2]
                } else {
                    routsum += sir[0]; goutsum += sir[1]; boutsum += sir[2]
                }
            }
            var stackpointer = radius
            for (x in 0 until w) {
                r[yi] = dv[rsum]; g[yi] = dv[gsum]; b[yi] = dv[bsum]
                rsum -= routsum; gsum -= goutsum; bsum -= boutsum
                val stackstart = stackpointer - radius + div
                val sir = stack[stackstart % div]
                routsum -= sir[0]; goutsum -= sir[1]; boutsum -= sir[2]
                if (y == 0) vmin[x] = min(x + radius + 1, wm)
                val p = pix[yw + vmin[x]]
                sir[0] = (p and 0xff0000) shr 16
                sir[1] = (p and 0x00ff00) shr 8
                sir[2] = p and 0x0000ff
                rinsum += sir[0]; ginsum += sir[1]; binsum += sir[2]
                rsum += rinsum; gsum += ginsum; bsum += binsum
                stackpointer = (stackpointer + 1) % div
                val sir2 = stack[stackpointer % div]
                routsum += sir2[0]; goutsum += sir2[1]; boutsum += sir2[2]
                rinsum -= sir2[0]; ginsum -= sir2[1]; binsum -= sir2[2]
                yi++
            }
            yw += w
        }

        for (x in 0 until w) {
            var rinsum = 0; var ginsum = 0; var binsum = 0
            var routsum = 0; var goutsum = 0; var boutsum = 0
            var rsum = 0; var gsum = 0; var bsum = 0
            var yp = -radius * w
            for (i in -radius..radius) {
                yi = max(0, yp) + x
                val sir = stack[i + radius]
                sir[0] = r[yi]; sir[1] = g[yi]; sir[2] = b[yi]
                val rbs = r1 - kotlin.math.abs(i)
                rsum += r[yi] * rbs; gsum += g[yi] * rbs; bsum += b[yi] * rbs
                if (i > 0) {
                    rinsum += sir[0]; ginsum += sir[1]; binsum += sir[2]
                } else {
                    routsum += sir[0]; goutsum += sir[1]; boutsum += sir[2]
                }
                if (i < hm) yp += w
            }
            yi = x
            var stackpointer = radius
            for (y in 0 until h) {
                pix[yi] = (0xff000000.toInt()) or (dv[rsum] shl 16) or (dv[gsum] shl 8) or dv[bsum]
                rsum -= routsum; gsum -= goutsum; bsum -= boutsum
                val stackstart = stackpointer - radius + div
                val sir = stack[stackstart % div]
                routsum -= sir[0]; goutsum -= sir[1]; boutsum -= sir[2]
                if (x == 0) vmin[y] = min(y + r1, hm) * w
                val p = x + vmin[y]
                sir[0] = r[p]; sir[1] = g[p]; sir[2] = b[p]
                rinsum += sir[0]; ginsum += sir[1]; binsum += sir[2]
                rsum += rinsum; gsum += ginsum; bsum += binsum
                stackpointer = (stackpointer + 1) % div
                val sir2 = stack[stackpointer]
                routsum += sir2[0]; goutsum += sir2[1]; boutsum += sir2[2]
                rinsum -= sir2[0]; ginsum -= sir2[1]; binsum -= sir2[2]
                yi += w
            }
        }

        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        out.setPixels(pix, 0, w, 0, 0, w, h)
        return out
    }

    private fun loadLogoBitmap(logoUri: String): Bitmap? {
        if (logoUri.isBlank()) return null
        return try {
            val uri = Uri.parse(logoUri)
            val rawBitmap = if (uri.scheme == "content") {
                reactContext.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
            } else {
                val path = uri.path ?: logoUri
                BitmapFactory.decodeFile(path)
            } ?: return null

            val maxDim = 84
            val scale = min(maxDim.toFloat() / rawBitmap.width, maxDim.toFloat() / rawBitmap.height)
            val dstW = max(1, (rawBitmap.width * scale).toInt())
            val dstH = max(1, (rawBitmap.height * scale).toInt())
            val scaled = Bitmap.createScaledBitmap(rawBitmap, dstW, dstH, true)
            if (scaled != rawBitmap) rawBitmap.recycle()
            scaled
        } catch (_: Throwable) {
            null
        }
    }

    private fun stripEmojis(input: String): String {
        if (input.isEmpty()) return ""
        val sb = StringBuilder()
        var i = 0
        while (i < input.length) {
            val cp = input.codePointAt(i)
            val charCount = Character.charCount(cp)
            val isEmoji = (cp in 0x1F000..0x1FFFF) ||
                (cp in 0x2600..0x27BF) ||
                (cp in 0x2300..0x23FF) ||
                (cp in 0x2B50..0x2B55)
            if (!isEmoji) {
                sb.appendCodePoint(cp)
            }
            i += charCount
        }
        return sb.toString().trim()
    }

    /**
     * Media3 CanvasOverlay rendering:
     * 1. Blurred top/bottom fill for 9:16
     * 2. Opening hook headline banner (0s - 3.5s)
     * 3. Word-by-word highlighted viral subtitles
     * 4. Corner watermark
     */
    private class ClipSnapCanvasOverlay(
        private val targetWidth: Int,
        private val targetHeight: Int,
        private val layoutMode: String,
        private val blurredBackdrop: Bitmap?,
        private val fgRect: Rect,
        private val captionStyle: String,
        private val captionsEnabled: Boolean,
        private val words: List<WordItem>,
        private val hookEnabled: Boolean,
        private val hookText: String,
        private val watermarkEnabled: Boolean,
        private val watermarkText: String,
        private val watermarkPosition: String,
        private val logoBitmap: Bitmap?
    ) : CanvasOverlay(/* useInputFrames = */ true) {

        private val chunkSize = 4
        private val chunks: List<List<WordItem>> = words.chunked(chunkSize)

        private val bgPaint = Paint(Paint.FILTER_BITMAP_FLAG)
        private val fallbackGradientPaint = Paint()

        private val hookFillPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = if (captionStyle == "clean_white") Color.WHITE else Color.rgb(255, 230, 0)
            textSize = targetWidth * 0.048f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setShadowLayer(8f, 0f, 4f, Color.BLACK)
        }
        private val hookStrokePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = targetWidth * 0.048f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            style = Paint.Style.STROKE
            strokeWidth = 10f
            strokeJoin = Paint.Join.ROUND
        }
        private val hookPillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(180, 12, 16, 26)
        }

        private val captionFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = targetWidth * 0.056f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setShadowLayer(8f, 0f, 4f, Color.BLACK)
        }
        private val captionStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = targetWidth * 0.056f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            style = Paint.Style.STROKE
            strokeWidth = 12f
            strokeJoin = Paint.Join.ROUND
        }

        private val watermarkFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(175, 255, 255, 255)
            textSize = targetWidth * 0.032f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        private val watermarkStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(190, 0, 0, 0)
            textSize = targetWidth * 0.032f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            style = Paint.Style.STROKE
            strokeWidth = 6f
            strokeJoin = Paint.Join.ROUND
        }

        override fun configure(videoSize: Size) {
            super.configure(videoSize)
            fallbackGradientPaint.shader = LinearGradient(
                0f, 0f, targetWidth.toFloat(), targetHeight.toFloat(),
                intArrayOf(Color.rgb(30, 27, 75), Color.rgb(15, 23, 42), Color.rgb(49, 46, 129)),
                null,
                Shader.TileMode.CLAMP
            )
        }

        override fun onDraw(canvas: Canvas, presentationTimeUs: Long) {
            canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
            val timeSec = presentationTimeUs / 1_000_000.0

            // 1. Draw Blurred Fill outside foreground video rectangle
            if (layoutMode == "blurred_fill") {
                drawBackdropBars(canvas)
            }

            // 2. Draw Opening Hook Headline (0.0s - 3.5s)
            if (hookEnabled && hookText.isNotEmpty() && timeSec <= 3.5) {
                drawHookBanner(canvas)
            }

            // 3. Draw Word-by-Word Animated Subtitles
            if (captionsEnabled && chunks.isNotEmpty()) {
                drawAnimatedCaptions(canvas, timeSec)
            }

            // 4. Draw Corner Watermark (Logo + Social Handle Text together)
            if (watermarkEnabled && (watermarkText.isNotEmpty() || logoBitmap != null)) {
                drawWatermark(canvas)
            }
        }

        private fun drawBackdropBars(canvas: Canvas) {
            val w = targetWidth
            val h = targetHeight
            val paint = if (blurredBackdrop != null) bgPaint else fallbackGradientPaint

            // Top bar
            if (fgRect.top > 0) {
                val topRect = Rect(0, 0, w, fgRect.top)
                if (blurredBackdrop != null) {
                    canvas.drawBitmap(blurredBackdrop, topRect, topRect, paint)
                } else {
                    canvas.drawRect(topRect, paint)
                }
            }
            // Bottom bar
            if (fgRect.bottom < h) {
                val botRect = Rect(0, fgRect.bottom, w, h)
                if (blurredBackdrop != null) {
                    canvas.drawBitmap(blurredBackdrop, botRect, botRect, paint)
                } else {
                    canvas.drawRect(botRect, paint)
                }
            }
        }

        private fun drawHookBanner(canvas: Canvas) {
            val maxTextWidth = (targetWidth * 0.86f).toInt()
            val strokeLayout = StaticLayout.Builder.obtain(hookText, 0, hookText.length, hookStrokePaint, maxTextWidth)
                .setAlignment(Layout.Alignment.ALIGN_CENTER)
                .build()
            val fillLayout = StaticLayout.Builder.obtain(hookText, 0, hookText.length, hookFillPaint, maxTextWidth)
                .setAlignment(Layout.Alignment.ALIGN_CENTER)
                .build()

            val x = (targetWidth - maxTextWidth) / 2f
            val y = targetHeight * 0.085f
            val padX = 28f
            val padY = 18f
            val pillRect = RectF(
                x - padX,
                y - padY,
                x + maxTextWidth + padX,
                y + fillLayout.height + padY
            )
            canvas.drawRoundRect(pillRect, 24f, 24f, hookPillPaint)

            canvas.save()
            canvas.translate(x, y)
            strokeLayout.draw(canvas)
            fillLayout.draw(canvas)
            canvas.restore()
        }

        private fun drawAnimatedCaptions(canvas: Canvas, timeSec: Double) {
            var activeChunk: List<WordItem>? = null
            var activeIdx = -1

            for (chunk in chunks) {
                val cStart = chunk.first().start
                val cEnd = chunk.last().end
                if (timeSec in cStart..cEnd) {
                    activeChunk = chunk
                    for (idx in chunk.indices) {
                        if (timeSec >= chunk[idx].start && timeSec <= chunk[idx].end) {
                            activeIdx = idx
                            break
                        }
                    }
                    if (activeIdx == -1) {
                        activeIdx = chunk.indexOfLast { timeSec >= it.start }.coerceAtLeast(0)
                    }
                    break
                }
            }

            if (activeChunk == null) return

            val spaceWidth = captionFillPaint.measureText(" ")
            val wordWidths = activeChunk.map { captionFillPaint.measureText(it.word) }
            val totalWidth = wordWidths.sum() + spaceWidth * (activeChunk.size - 1)

            var curX = (targetWidth - totalWidth) / 2f
            val baseY = targetHeight * 0.76f

            for (i in activeChunk.indices) {
                val item = activeChunk[i]
                val isActive = (i == activeIdx)
                val wWidth = wordWidths[i]

                captionFillPaint.color = when {
                    isActive && captionStyle != "clean_white" -> Color.rgb(255, 230, 0)
                    else -> Color.WHITE
                }
                captionFillPaint.isUnderlineText = isActive && captionStyle == "clean_white"

                canvas.save()
                if (isActive) {
                    val cx = curX + wWidth / 2f
                    canvas.scale(1.10f, 1.10f, cx, baseY - 15f)
                }
                canvas.drawText(item.word, curX, baseY, captionStrokePaint)
                canvas.drawText(item.word, curX, baseY, captionFillPaint)
                canvas.restore()

                curX += wWidth + spaceWidth
            }
        }

        private fun drawWatermark(canvas: Canvas) {
            val marginX = 48f
            val isLeft = watermarkPosition == "top_left" || watermarkPosition == "bottom_left"
            val isTop = watermarkPosition == "top_left" || watermarkPosition == "top_right"

            val textWidth = if (watermarkText.isNotEmpty()) watermarkFillPaint.measureText(watermarkText) else 0f
            val logoH = logoBitmap?.height?.toFloat() ?: 0f

            if (isTop) {
                var curY = 65f
                if (logoBitmap != null) {
                    val logoX = if (isLeft) marginX else targetWidth - logoBitmap.width - marginX
                    canvas.drawBitmap(logoBitmap, logoX, curY, bgPaint)
                    curY += logoH + 34f
                }
                if (watermarkText.isNotEmpty()) {
                    val textX = if (isLeft) marginX else targetWidth - textWidth - marginX
                    val textY = if (logoBitmap != null) curY else targetHeight * 0.06f
                    canvas.drawText(watermarkText, textX, textY, watermarkStrokePaint)
                    canvas.drawText(watermarkText, textX, textY, watermarkFillPaint)
                }
            } else {
                val textY = targetHeight * 0.89f
                if (watermarkText.isNotEmpty()) {
                    val textX = if (isLeft) marginX else targetWidth - textWidth - marginX
                    canvas.drawText(watermarkText, textX, textY, watermarkStrokePaint)
                    canvas.drawText(watermarkText, textX, textY, watermarkFillPaint)
                }
                if (logoBitmap != null) {
                    val logoX = if (isLeft) marginX else targetWidth - logoBitmap.width - marginX
                    val logoY = if (watermarkText.isNotEmpty()) {
                        textY - watermarkFillPaint.textSize - logoH - 18f
                    } else {
                        textY - logoH
                    }
                    canvas.drawBitmap(logoBitmap, logoX, logoY, bgPaint)
                }
            }
        }
    }

    /**
     * Saves exported MP4 directly into the user's phone gallery (DCIM/ClipSnap)
     */
    private fun saveToGallery(sourceFile: File): Uri? {
        val resolver = reactContext.contentResolver
        val contentValues = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "ClipSnap_${System.currentTimeMillis()}.mp4")
            put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, "DCIM/ClipSnap")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        }

        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, contentValues)
            ?: return null

        resolver.openOutputStream(uri)?.use { outputStream ->
            FileInputStream(sourceFile).use { inputStream ->
                inputStream.copyTo(outputStream)
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            contentValues.clear()
            contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, contentValues, null, null)
        }

        return uri
    }
}
