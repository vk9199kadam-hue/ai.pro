import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database.session import get_db
from app.database.models import User, UserCredits, CreditTransaction

router = APIRouter(prefix="/credits", tags=["Credits & Monetization"])

class BalanceResponse(BaseModel):
    user_id: str
    balance: int

class ClaimAdRewardRequest(BaseModel):
    user_id: str
    ad_unit_id: Optional[str] = "rewarded_ad_clip"
    idempotency_key: str

class DeductCreditRequest(BaseModel):
    user_id: str
    clip_id: str
    idempotency_key: str

@router.get("/balance/{user_id}", response_model=BalanceResponse)
def get_user_balance(user_id: str, db: Session = Depends(get_db)):
    """Fetch user credit balance."""
    credit_record = db.query(UserCredits).filter(UserCredits.user_id == user_id).first()
    if not credit_record:
        # Auto-create user with 5 free clips
        new_user = User(user_id=user_id, email=f"{user_id}@device.user")
        new_credits = UserCredits(user_id=user_id, balance=5)
        bonus_tx = CreditTransaction(
            user_id=user_id,
            amount=5,
            reason="SIGNUP_BONUS",
            idempotency_key=f"bonus_{user_id}"
        )
        db.add_all([new_user, new_credits, bonus_tx])
        db.commit()
        return BalanceResponse(user_id=user_id, balance=5)
        
    return BalanceResponse(user_id=user_id, balance=credit_record.balance)

@router.post("/claim-ad-reward", response_model=BalanceResponse)
def claim_ad_reward(req: ClaimAdRewardRequest, db: Session = Depends(get_db)):
    """Reward user with +1 clip credit after completing an AdMob rewarded ad."""
    # Check idempotency
    existing_tx = db.query(CreditTransaction).filter(
        CreditTransaction.idempotency_key == req.idempotency_key
    ).first()
    if existing_tx:
        credit = db.query(UserCredits).filter(UserCredits.user_id == req.user_id).first()
        return BalanceResponse(user_id=req.user_id, balance=credit.balance if credit else 0)

    credit = db.query(UserCredits).filter(UserCredits.user_id == req.user_id).first()
    if not credit:
        credit = UserCredits(user_id=req.user_id, balance=5)
        db.add(credit)

    credit.balance += 1
    tx = CreditTransaction(
        user_id=req.user_id,
        amount=1,
        reason="REWARD_AD",
        idempotency_key=req.idempotency_key
    )
    db.add(tx)
    db.commit()
    return BalanceResponse(user_id=req.user_id, balance=credit.balance)

@router.post("/deduct-export", response_model=BalanceResponse)
def deduct_credit_for_export(req: DeductCreditRequest, db: Session = Depends(get_db)):
    """Deduct 1 credit when user exports a clip."""
    existing_tx = db.query(CreditTransaction).filter(
        CreditTransaction.idempotency_key == req.idempotency_key
    ).first()
    if existing_tx:
        credit = db.query(UserCredits).filter(UserCredits.user_id == req.user_id).first()
        return BalanceResponse(user_id=req.user_id, balance=credit.balance if credit else 0)

    credit = db.query(UserCredits).filter(UserCredits.user_id == req.user_id).first()
    if not credit or credit.balance < 1:
        raise HTTPException(status_code=402, detail="Insufficient credits. Watch an ad to earn more!")

    credit.balance -= 1
    tx = CreditTransaction(
        user_id=req.user_id,
        amount=-1,
        reason="EXPORT_CLIP",
        idempotency_key=req.idempotency_key
    )
    db.add(tx)
    db.commit()
    return BalanceResponse(user_id=req.user_id, balance=credit.balance)
