import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import squad_careers_lib as lib

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
def read(name):
    with open(os.path.join(FIX, name), encoding="utf-8", errors="replace") as f:
        return f.read()


class ParseDebuts(unittest.TestCase):
    def test_pacheco_debuto_en_liniers(self):
        debut = lib.pick_pro_debut(lib.parse_debuts(read("pacheco_debuts.html")))
        self.assertEqual(debut["date"], "2025-02-09")
        self.assertEqual(debut["club_tm_id"], 98564)
        self.assertEqual(debut["coach"], "Diego Herrero")

    def test_morrone_ignora_viareggio_juvenil(self):
        debuts = lib.parse_debuts(read("morrone_debuts.html"))
        self.assertTrue(any("Viareggio" in d["competition"] for d in debuts))
        debut = lib.pick_pro_debut(debuts)
        self.assertEqual(debut["date"], "2026-04-25")
        self.assertEqual(debut["club_tm_id"], 14542)
        self.assertIn("Domingo", debut["coach"])
        self.assertIn("Patronato", debut["opponent"])

    def test_richarte_debut_primera_nacional(self):
        debut = lib.pick_pro_debut(lib.parse_debuts(read("richarte_debuts.html")))
        self.assertEqual(debut["date"], "2024-04-21")
        self.assertEqual(debut["competition"], "Primera Nacional")
        self.assertIn("Col", debut["opponent"])

    def test_sin_tabla(self):
        self.assertEqual(lib.parse_debuts("<html></html>"), [])
        self.assertIsNone(lib.pick_pro_debut([]))


class ParseProfile(unittest.TestCase):
    def test_angelini(self):
        p = lib.parse_profile_html(read("angelini_profile.html"))
        self.assertEqual(p["nationality"], "Argentina")
        self.assertEqual(p["position"], "Lateral izquierdo")
        self.assertEqual(p["foot"], "Izquierdo")
        self.assertEqual(p["joined_at"], "2023-01-01")
        self.assertEqual(p["contract_until"], "2026-12-31")


RAW_HISTORY = {"history": {"terminated": [
    {"transferSource": {"clubId": "97767"}, "transferDestination": {"clubId": "77897"},
     "details": {"date": "2025-01-01T00:00:00+01:00"}, "typeDetails": {"type": "TRANSFER"}},
    {"transferSource": {"clubId": "77897"}, "transferDestination": {"clubId": "14542"},
     "details": {"date": "2026-01-01T00:00:00+01:00"}, "typeDetails": {"type": "INTERNAL_TRANSFER"}},
], "pending": []}}
NAMES = {"97767": "Don Torcuato Youth", "77897": "CA Temperley II", "14542": "CA Temperley", "19529": "CSD Merlo"}


class Transfers(unittest.TestCase):
    def test_normaliza_y_ordena(self):
        t = lib.normalize_transfers(RAW_HISTORY, NAMES)
        self.assertEqual([x["date"] for x in t], ["2025-01-01", "2026-01-01"])
        self.assertEqual(t[0]["from_name"], "Don Torcuato Youth")

    def test_youth_clubs(self):
        self.assertEqual(lib.youth_clubs(lib.normalize_transfers(RAW_HISTORY, NAMES)), ["Don Torcuato Youth", "CA Temperley II"])


class Classify(unittest.TestCase):
    def debut(self, club_id, name="X"):
        return {"club_tm_id": club_id, "club_name": name, "date": "2024-04-21",
                "opponent": "CA Colón", "competition": "Primera Nacional", "coach": "Mariano Campodónico"}

    def test_debut_en_temperley(self):
        ok, reason, review = lib.classify_homegrown(self.debut(14542, "CA Temperley"), [])
        self.assertTrue(ok); self.assertFalse(review)
        self.assertIn("21/04/2024", reason); self.assertIn("CA Temperley", reason)

    def test_debut_en_otro_club(self):
        ok, reason, review = lib.classify_homegrown(self.debut(98564, "CSD Liniers"), [])
        self.assertFalse(ok); self.assertIn("CSD Liniers", reason)

    def test_sin_debut_solo_juveniles_antes(self):
        ok, reason, review = lib.classify_homegrown(None, lib.normalize_transfers(RAW_HISTORY, NAMES))
        self.assertTrue(ok); self.assertTrue(review); self.assertIn("inferido", reason)

    def test_sin_debut_con_club_senior_antes(self):
        raw = {"history": {"terminated": [
            {"transferSource": {"clubId": "19529"}, "transferDestination": {"clubId": "14542"},
             "details": {"date": "2025-01-05T00:00:00+01:00"}, "typeDetails": {"type": "TRANSFER"}}], "pending": []}}
        ok, reason, review = lib.classify_homegrown(None, lib.normalize_transfers(raw, NAMES))
        self.assertFalse(ok); self.assertTrue(review); self.assertIn("CSD Merlo", reason)


class LinkApi(unittest.TestCase):
    API = {1: "V. Diaz", 2: "F. Diaz", 3: "J. Diaz", 4: "D. Trebotic", 5: "R. E. Quiroga", 6: "V. Aguinagalde"}

    def test_inicial_desambigua(self):
        self.assertEqual(lib.link_api_player("Franco Díaz", self.API), (2, "exact"))
        self.assertEqual(lib.link_api_player("Jonathan Díaz", self.API), (3, "exact"))

    def test_segunda_inicial(self):
        self.assertEqual(lib.link_api_player("Elías Quiroga", self.API), (5, "exact"))

    def test_apellido_unico_sin_inicial(self):
        self.assertEqual(lib.link_api_player("León Trebotic", self.API), (4, "surname-only"))

    def test_acentos_y_enie(self):
        self.assertEqual(lib.link_api_player("Valentín Aguiñagalde", self.API), (6, "exact"))

    def test_ambiguo_y_ninguno(self):
        self.assertEqual(lib.link_api_player("Juan Díaz", {1: "V. Diaz", 2: "F. Diaz"}), (None, "ambiguous"))
        self.assertEqual(lib.link_api_player("Nadie Nunca", self.API), (None, "none"))


if __name__ == "__main__":
    unittest.main()
