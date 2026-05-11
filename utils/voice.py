"""Voice synthesis and recognition utilities."""
import os


class VoiceManager:
    """Manages text-to-speech and speech-to-text operations."""

    @staticmethod
    def text_to_speech(text, lang="en", output_path="voice.mp3"):
        """Convert text to speech using gTTS."""
        try:
            from gtts import gTTS
            tts = gTTS(text, lang="ar" if lang == "ar" else "en")
            tts.save(output_path)
            return output_path
        except Exception as e:
            print(f"⚠️ TTS failed: {e}")
            return None

    @staticmethod
    def speech_to_text(audio_path):
        """Convert audio to text using SpeechRecognition."""
        if audio_path is None:
            return ""
        try:
            from pydub import AudioSegment
            import speech_recognition as sr

            sound = AudioSegment.from_file(audio_path)
            wav = "/tmp/temp_stt.wav"
            sound.export(wav, format="wav")

            recognizer = sr.Recognizer()
            with sr.AudioFile(wav) as source:
                data = recognizer.record(source)

            # Try Arabic first, then English
            try:
                return recognizer.recognize_google(data, language="ar-SA")
            except:
                return recognizer.recognize_google(data, language="en-US")
        except Exception as e:
            print(f"⚠️ STT failed: {e}")
            return ""
