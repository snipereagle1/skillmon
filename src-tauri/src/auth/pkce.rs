use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use sha2::{Digest, Sha256};

pub struct PkcePair {
    pub code_verifier: String,
    pub code_challenge: String,
}

pub fn generate_pkce_pair() -> PkcePair {
    let mut code_verifier = vec![0u8; 32];
    rand::thread_rng().fill_bytes(&mut code_verifier);
    let code_verifier = URL_SAFE_NO_PAD.encode(&code_verifier);

    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let code_challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

    PkcePair {
        code_verifier,
        code_challenge,
    }
}

pub fn generate_state() -> String {
    let mut state = vec![0u8; 16];
    rand::thread_rng().fill_bytes(&mut state);
    URL_SAFE_NO_PAD.encode(&state)
}
