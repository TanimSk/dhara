import logging
import threading

from django.core.mail import EmailMessage

logger = logging.getLogger("dhara")


# This function is used to send HTML emails with optional attachments.
class EmailThread(threading.Thread):
    def __init__(self, subject, html_content, recipient_list, sender, images=None):
        self.subject = subject
        self.recipient_list = recipient_list
        self.html_content = html_content
        self.sender = sender
        self.images = images
        threading.Thread.__init__(self, daemon=True)

    def run(self):
        if not self.recipient_list:
            logger.warning("No recipient list provided. Email not sent.")
            return
        msg = EmailMessage(self.subject, None, self.sender, self.recipient_list)

        # Attaching images
        if self.images is not None:
            for image in self.images:
                if isinstance(image, tuple):
                    attachment_name, attachment_content, attachment_mime_type = image
                    msg.attach(attachment_name, attachment_content, attachment_mime_type)

        msg.content_subtype = "html"
        msg.body = self.html_content
        try:
            msg.send()
        except Exception:
            logger.exception("Sending email %r failed", self.subject)


def send_html_mail(subject, html_content, recipient_list, sender, images=None):
    EmailThread(subject, html_content, recipient_list, sender, images).start()
