from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    restaurant_id: Optional[str] = None
    name: str
    slug: str


class CategoryCreate(BaseModel):
    name: str


class MenuItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    restaurant_id: Optional[str] = None
    name: str
    price: float
    category: Optional[str] = ""
    emoji: Optional[str] = "🍽️"
    image_url: Optional[str] = ""
    images: List[str] = Field(default_factory=list)
    available: bool = True
    cost_price: Optional[float] = None  # optional COGS for real gross profit
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MenuItemCreate(BaseModel):
    name: str
    price: float
    category: Optional[str] = ""
    emoji: Optional[str] = "🍽️"
    image_url: Optional[str] = ""
    images: Optional[List[str]] = None
    available: bool = True
    cost_price: Optional[float] = None


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    emoji: Optional[str] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = None
    available: Optional[bool] = None
    cost_price: Optional[float] = None


class RestaurantSettings(BaseModel):
    restaurant_name: str = "ZenTaap Restaurant"
    logo_url: str = ""
    gst_number: str = ""
    gst_rate: Optional[float] = None
    address: str = ""
    phone: str = ""
    printer_type: str = "browser"
    theme: str = "dark"
    subscription_plan: Optional[str] = None
    subscription_status: str = "none"
    trial_start: Optional[str] = None
    trial_end: Optional[str] = None
    autopay: bool = True
    payment_method: Optional[str] = None
    customer_pin: str = ""
    kitchen_pin: str = ""


class SettingsUpdate(BaseModel):
    restaurant_name: Optional[str] = None
    logo_url: Optional[str] = None
    gst_number: Optional[str] = None
    gst_rate: Optional[float] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    printer_type: Optional[str] = None
    theme: Optional[str] = None


class CustomerPinUpdate(BaseModel):
    new_pin: str


class KitchenPinUpdate(BaseModel):
    new_pin: str


class KitchenLoginBody(BaseModel):
    pin: str
    slug: Optional[str] = None


class CustomerLoginBody(BaseModel):
    pin: str


class RequestOtpBody(BaseModel):
    contact_number: str


class VerifyOtpBody(BaseModel):
    contact_number: str
    otp: str
    new_pin: str


class SubscribeRequest(BaseModel):
    plan: str = ""
    payment_method: str = ""


class OrderItem(BaseModel):
    name: str
    qty: int
    price: float


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    restaurant_id: Optional[str] = None
    order_number: int
    table: int  # 0 = walk-in
    items: List[OrderItem]
    amount: float
    status: str = "new"
    notes: Optional[str] = None
    payment_mode: Optional[str] = None
    paid_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class OrderCreate(BaseModel):
    table: int
    items: List[OrderItem]
    notes: Optional[str] = None


class OrderUpdate(BaseModel):
    status: str


class LoginRequest(BaseModel):
    pin: str
    device_id: Optional[str] = None
    device_label: Optional[str] = None
    contact_number: Optional[str] = None


class SignupRequest(BaseModel):
    manager_name: str
    restaurant_name: str
    contact_number: str
    pin: str
    email: Optional[str] = None
    slug: Optional[str] = None


class ProfileUpdate(BaseModel):
    manager_name: Optional[str] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    restaurant_name: Optional[str] = None
    slug: Optional[str] = None


class ChangePinRequest(BaseModel):
    old_pin: str
    new_pin: str


class RecoverPinRequest(BaseModel):
    contact_number: str
    new_pin: str


class ImageUploadRequest(BaseModel):
    data: str


class SubscribeBody(BaseModel):
    tables: int
    payment_method: str


class RazorpayOrderBody(BaseModel):
    tables: int


class VerifyPaymentBody(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: Optional[str] = None
    enable_autopay: bool = True


class VerifySubscriptionBody(BaseModel):
    razorpay_subscription_id: str
    razorpay_payment_id: str
    razorpay_signature: Optional[str] = None


class AdminLoginBody(BaseModel):
    username: str
    password: str


class AdminPasswordBody(BaseModel):
    current_password: str
    new_password: str


class PricingUpdateBody(BaseModel):
    per_table: float
    base_fee: Optional[float] = None
    gst_rate_pct: Optional[float] = None
    min_tables: Optional[int] = None
    max_tables: Optional[int] = None
