# shared components will be written here
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 24
    page_size_query_param = "page_size"
    max_page_size = 500
    page_query_param = "p"

    def get_paginated_response(self, data):
        return Response(
            {
                "count": self.page.paginator.count,
                "page_size": self.get_page_size(self.request),
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "num_pages": self.page.paginator.num_pages,
                "current_page": self.page.number,
                "results": data,
            }
        )


GB = 1024**3
TB = 1024**4


def is_internal_request(request, settings):
    """Localhost callbacks (tusd hooks, encoder) must present the shared secret."""
    import hmac

    secret = settings.INTERNAL_SECRET
    supplied = request.headers.get("X-Internal-Secret") or request.query_params.get("secret", "")
    return bool(secret) and hmac.compare_digest(secret, supplied)
