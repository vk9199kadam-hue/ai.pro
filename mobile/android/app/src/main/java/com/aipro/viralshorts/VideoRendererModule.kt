package com.aipro.viralshorts

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.effect.ScaleAndRotateTransformation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.TransformationRequest
import androidx.media3.transformer.Transformer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream

@OptIn(UnstableApi::class)
class VideoRendererModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun getName(): String = "VideoRendererModule"

    @ReactMethod
    fun renderClip(manifestJson: String, promise: Promise) {
        try {
            val manifest = JSONObject(manifestJson)
            val sourceUrl = manifest.getString("source_url")
            val trimStartSec = manifest.getDouble("trim_start")
            val trimEndSec = manifest.getDouble("trim_end")
            val targetWidth = manifest.optInt("target_width", 1080)
            val targetHeight = manifest.optInt("target_height", 1920)

            // Temporary output file in app cache
            val tempOutputFile = File(
                reactContext.cacheDir,
                "render_clip_${System.currentTimeMillis()}.mp4"
            )

            // 1. Configure Slicing via MediaItem.ClippingConfiguration
            val mediaItem = MediaItem.Builder()
                .setUri(Uri.parse(sourceUrl))
                .setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder()
                        .setStartPositionMs((trimStartSec * 1000).toLong())
                        .setEndPositionMs((trimEndSec * 1000).toLong())
                        .build()
                )
                .build()

            // 2. Configure 9:16 Portrait Canvas (1080x1920)
            val presentationEffect = Presentation.createForWidthAndHeight(
                targetWidth,
                targetHeight,
                Presentation.LAYOUT_SCALE_TO_FIT
            )

            val videoEffects = listOf(presentationEffect)
            val editedMediaItem = EditedMediaItem.Builder(mediaItem)
                .setEffects(Effects(emptyList(), videoEffects))
                .build()

            // 3. Configure Hardware-Accelerated Transformer Pipeline
            val transformer = Transformer.Builder(reactContext)
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                .addListener(object : Transformer.Listener {
                    override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                        mainHandler.post {
                            // 4. Save rendered file directly into Android MediaStore (DCIM/ClipSnap)
                            val finalUri = saveToGallery(tempOutputFile)
                            tempOutputFile.delete() // Storage hygiene: auto-purge temp cache

                            val result = JSONObject().apply {
                                put("outputPath", finalUri.toString())
                                put("durationMs", ((trimEndSec - trimStartSec) * 1000).toLong())
                                put("width", targetWidth)
                                put("height", targetHeight)
                                put("fileSizeBytes", exportResult.fileSizeBytes)
                            }
                            promise.resolve(result.toString())
                        }
                    }

                    override fun onError(
                        composition: Composition,
                        exportResult: ExportResult,
                        exportException: ExportException
                    ) {
                        mainHandler.post {
                            tempOutputFile.delete()
                            promise.reject("RENDER_ERROR", exportException.message, exportException)
                        }
                    }
                })
                .build()

            // 5. Start Hardware Encoding
            transformer.start(editedMediaItem, tempOutputFile.absolutePath)

            // 6. Monitor Progress & Dispatch Event to React Native
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
                        mainHandler.postDelayed(this, 250)
                    } else if (progressState != Transformer.PROGRESS_STATE_NOT_STARTED) {
                        mainHandler.postDelayed(this, 250)
                    }
                }
            }
            mainHandler.post(progressRunnable)

        } catch (e: Exception) {
            promise.reject("INVALID_MANIFEST", e.message, e)
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
