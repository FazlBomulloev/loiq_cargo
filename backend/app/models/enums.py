from enum import StrEnum


class UserRole(StrEnum):
    CHINA_STAFF = "china_staff"
    DUSHANBE_STAFF = "dushanbe_staff"
    OWNER = "owner"


class WarehouseCode(StrEnum):
    YIWU = "yiwu"
    URUMQI = "urumqi"
    KASHGAR = "kashgar"


class GoodsStatus(StrEnum):
    IN_CHINA = "in_china"
    IN_TRANSIT = "in_transit"
    IN_DUSHANBE = "in_dushanbe"
    DELIVERED = "delivered"


class ShipmentStatus(StrEnum):
    DRAFT = "draft"
    IN_TRANSIT = "in_transit"
    ARRIVED = "arrived"
    CLOSED = "closed"


class ChangeRequestStatus(StrEnum):
    PENDING = "pending"
    APPLIED = "applied"
    REJECTED = "rejected"


class ChangeRequestAction(StrEnum):
    EDIT_GOODS = "edit_goods"
    DELETE_GOODS = "delete_goods"
    OTHER = "other"


class TelegramVerificationStatus(StrEnum):
    NOT_STARTED = "not_started"
    PENDING = "pending"
    VERIFIED = "verified"


class PaymentStatus(StrEnum):
    UNPAID = "unpaid"
    PAID = "paid"
    DEBT = "debt"
