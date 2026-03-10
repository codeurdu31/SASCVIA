"""
Service de notification email — envoie un mail à l'admin quand quelqu'un demande l'accès.
Utilise Gmail SMTP avec un mot de passe d'application.
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _get_smtp_config() -> dict[str, str]:
    """Récupère la config SMTP depuis les variables d'environnement."""
    return {
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "admin_email": os.getenv("ADMIN_EMAIL", ""),
    }


def send_access_request_notification(
    requester_name: str,
    requester_email: str,
    app_url: str = "",
) -> bool:
    """
    Envoie un email à l'admin pour l'informer d'une nouvelle demande d'accès.

    Returns:
        True si l'email a été envoyé, False sinon.
    """
    config = _get_smtp_config()

    if not config["user"] or not config["password"] or not config["admin_email"]:
        print(f"[email] Config SMTP manquante — notification non envoyée pour {requester_email}")
        return False

    if not app_url:
        app_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    subject = f"[ProjetSASIA] Nouvelle demande d'accès de {requester_name}"

    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a; margin-bottom: 16px;">Nouvelle demande d'acces</h2>
      <div style="background: #f8f9fa; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 4px 0;"><strong>Nom :</strong> {requester_name}</p>
        <p style="margin: 4px 0;"><strong>Email :</strong> {requester_email}</p>
      </div>
      <p style="color: #555; font-size: 14px;">
        Connecte-toi a l'app pour accepter ou refuser cette demande :
      </p>
      <a href="{app_url}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; margin-top: 8px;">
        Gerer les demandes
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        ProjetSASIA — Notification automatique
      </p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["From"] = config["user"]
    msg["To"] = config["admin_email"]
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(config["host"], config["port"]) as server:
            server.starttls()
            server.login(config["user"], config["password"])
            server.send_message(msg)
        print(f"[email] Notification envoyée à {config['admin_email']} pour {requester_email}")
        return True
    except Exception as e:
        print(f"[email] Erreur envoi notification : {e}")
        return False


def send_access_approved_notification(
    user_name: str,
    user_email: str,
    app_url: str = "",
) -> bool:
    """
    Envoie un email à l'utilisateur pour l'informer que son accès a été approuvé.
    """
    config = _get_smtp_config()

    if not config["user"] or not config["password"]:
        print(f"[email] Config SMTP manquante — notification non envoyée pour {user_email}")
        return False

    if not app_url:
        app_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    subject = "ProjetSASIA — Ton acces a ete approuve !"

    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a; margin-bottom: 16px;">Bienvenue sur ProjetSASIA !</h2>
      <p style="color: #333;">Salut {user_name},</p>
      <p style="color: #555;">
        Ta demande d'acces a ete acceptee. Tu peux maintenant utiliser l'app pour analyser ton CV,
        generer des lettres de motivation et preparer tes entretiens.
      </p>
      <a href="{app_url}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; margin-top: 12px;">
        Commencer
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">
        ProjetSASIA — Notification automatique
      </p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["From"] = config["user"]
    msg["To"] = user_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(config["host"], config["port"]) as server:
            server.starttls()
            server.login(config["user"], config["password"])
            server.send_message(msg)
        print(f"[email] Notification d'approbation envoyée à {user_email}")
        return True
    except Exception as e:
        print(f"[email] Erreur envoi approbation : {e}")
        return False
