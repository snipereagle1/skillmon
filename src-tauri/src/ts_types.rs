/// Type aliases for typeshare compatibility.
/// typeshare doesn't support i64/usize natively; these aliases are
/// mapped to "number" in typeshare.toml and are transparent to Rust.
#[allow(non_camel_case_types)]
pub type i64_ts = i64;
#[allow(non_camel_case_types)]
pub type usize_ts = usize;
