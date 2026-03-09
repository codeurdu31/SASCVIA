"""Service de synthese vocale via OpenAI TTS-1."""
import os

from openai import AsyncOpenAI


def _get_client() -> AsyncOpenAI:
    """Retourne un client OpenAI async."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY non configuree dans .env")
    return AsyncOpenAI(api_key=api_key)


async def text_to_speech(text: str, voice: str = "nova") -> bytes:
    """Convertit du texte en audio MP3 via OpenAI TTS-1.

    Voix disponibles : alloy, echo, fable, onyx, nova, shimmer.
    Cout : ~$15 / 1M caracteres (~$0.02 pour 15 questions).
    """
    client = _get_client()
    response = await client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=text,
        response_format="mp3",
    )
    return response.content
