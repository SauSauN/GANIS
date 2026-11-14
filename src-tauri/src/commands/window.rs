//! Commandes de la fenêtre principale.
//!
//! GANIS dessine sa propre barre de titre (`decorations: false`) : Windows
//! n'y voit donc pas son bouton « Agrandir », et n'affiche pas les Snap
//! Layouts (dispositions d'ancrage) quand on le survole. L'interface appelle
//! `show_snap_layouts` après un survol prolongé de son propre bouton
//! « Agrandir / Restaurer » : la commande remet la fenêtre au premier plan et
//! envoie Win+Z, le raccourci de Windows 11 qui ouvre ce même menu pour la
//! fenêtre active.

/// Ouvre les Snap Layouts de Windows 11 pour la fenêtre (sans effet ailleurs).
#[tauri::command]
pub fn show_snap_layouts(window: tauri::WebviewWindow) {
    #[cfg(windows)]
    {
        // Win+Z agit sur la fenêtre active : elle doit l'être.
        let _ = window.set_focus();
        snap::press_win_z();
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
mod snap {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_LWIN,
    };

    /// Touche « Z » (les lettres ont le code de leur majuscule ASCII).
    const VK_Z: VIRTUAL_KEY = 0x5A;

    fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 },
            },
        }
    }

    /// Appuie puis relâche Win+Z, d'un seul envoi (les touches ne restent
    /// jamais enfoncées, même si l'envoi est interrompu).
    pub fn press_win_z() {
        let inputs = [key(VK_LWIN, false), key(VK_Z, false), key(VK_Z, true), key(VK_LWIN, true)];
        // SAFETY : `inputs` est un tableau valide de `INPUT` du bon type, dont
        // la taille et le nombre sont passés exactement à `SendInput`, qui ne
        // le garde pas après l'appel.
        unsafe {
            SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
        }
    }
}
