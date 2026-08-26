from sqlalchemy import Enum


def pg_enum(enum_cls, *, name: str):
    """SA-Enum по значениям (.value), а не по именам (.name).

    Наши StrEnum-члены имеют lowercase-значения ("owner"), а
    SA по умолчанию пишет в БД имена ("OWNER") — это ломает
    Postgres enum-типы, где значения — lowercase.
    """
    return Enum(
        enum_cls,
        name=name,
        values_callable=lambda e: [x.value for x in e],
    )
