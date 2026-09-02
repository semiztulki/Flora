import * as ImagePicker from "expo-image-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import * as attachmentsApi from "../api/attachments";
import { useAuth } from "../context/AuthContext";
import { getLocalAttachmentUri } from "../utils/attachmentCache";
import { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

// Day/month/year are kept as three separate fields rather than one parsed
// string — "show year" only ever controls whether OTHERS see the year
// (birthday_show_year, sent separately to the server); it must never affect
// what's actually stored, or toggling it off and saving again would silently
// throw the real year away.
function splitBirthday(isoDate: string | null): { day: string; month: string; year: string } {
  if (!isoDate) return { day: "", month: "", year: "" };
  const [year, month, day] = isoDate.split("-");
  return { day, month, year };
}

// Accepts a 2-digit year ("91") as shorthand alongside a full 4-digit one
// ("1991") — a common pivot: 00-30 reads as 2000s, 31-99 as 1900s.
function normalizeYear(input: string): number {
  const n = parseInt(input, 10);
  if (input.length <= 2) return n <= 30 ? 2000 + n : 1900 + n;
  return n;
}

/** Combines the three fields into "YYYY-MM-DD", `null` if all three are
 * empty (clears the birthday), or `"invalid"` if only some are filled in or
 * the numbers don't make sense. */
function buildBirthdayIso(day: string, month: string, year: string): string | null | "invalid" {
  const d = day.trim();
  const m = month.trim();
  const y = year.trim();
  if (!d && !m && !y) return null;

  const dayNum = parseInt(d, 10);
  const monthNum = parseInt(m, 10);
  if (!d || !m || !y || Number.isNaN(dayNum) || Number.isNaN(monthNum)) return "invalid";
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return "invalid";
  if (!/^\d{1,4}$/.test(y)) return "invalid";

  const yearNum = normalizeYear(y);
  return `${String(yearNum).padStart(4, "0")}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}

export default function ProfileScreen({ navigation }: Props) {
  const { user, updateProfile, updateAvatar, wipeLocalData } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [pronouns, setPronouns] = useState(user?.pronouns ?? "");
  const initialBirthday = splitBirthday(user?.birthday ?? null);
  const [birthdayDay, setBirthdayDay] = useState(initialBirthday.day);
  const [birthdayMonth, setBirthdayMonth] = useState(initialBirthday.month);
  const [birthdayYear, setBirthdayYear] = useState(initialBirthday.year);
  const [birthdayShowYear, setBirthdayShowYear] = useState(user?.birthday_show_year ?? true);
  const [city, setCity] = useState(user?.city ?? "");
  const [country, setCountry] = useState(user?.country ?? "");
  const [languages, setLanguages] = useState(user?.languages ?? "");
  const [occupation, setOccupation] = useState(user?.occupation ?? "");
  const [interests, setInterests] = useState(user?.interests ?? "");
  const [about, setAbout] = useState(user?.about ?? "");
  const [website, setWebsite] = useState(user?.website ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPublic, setEmailPublic] = useState(user?.email_public ?? false);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [phonePublic, setPhonePublic] = useState(user?.phone_public ?? false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.avatar) {
      getLocalAttachmentUri(user.avatar.id, user.avatar.content_type)
        .then(setAvatarUri)
        .catch(() => {});
    } else {
      setAvatarUri(null);
    }
  }, [user?.avatar]);

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Нет доступа", "Разрешите доступ к галерее, чтобы выбрать аватар.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setIsUploadingAvatar(true);
    try {
      const fileName = asset.fileName ?? `avatar-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? "image/jpeg";
      const uploaded = await attachmentsApi.uploadAttachment(asset.uri, fileName, mimeType);
      await updateAvatar(uploaded.id);
    } catch (e: any) {
      Alert.alert("Не удалось загрузить аватар", e?.response?.data?.detail ?? "Попробуйте ещё раз");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setError(null);

    const birthdayIso = buildBirthdayIso(birthdayDay, birthdayMonth, birthdayYear);
    if (birthdayIso === "invalid") {
      setError("Дата рождения — заполните число, месяц и год (год можно двумя цифрами, например 91)");
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        pronouns: pronouns.trim(),
        birthday: birthdayIso,
        birthdayShowYear,
        city: city.trim(),
        country: country.trim(),
        languages: languages.trim(),
        occupation: occupation.trim(),
        interests: interests.trim(),
        about: about.trim(),
        website: website.trim(),
        email: email.trim(),
        emailPublic,
        phone: phone.trim(),
        phonePublic,
      });
      navigation.goBack();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось сохранить профиль");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.avatarWrap} onPress={handlePickAvatar} disabled={isUploadingAvatar}>
        {isUploadingAvatar ? (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <ActivityIndicator />
          </View>
        ) : avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarHint}>Добавить фото</Text>
          </View>
        )}
      </Pressable>

      <Text style={styles.label}>Номер (UIN)</Text>
      <Text style={styles.uinValue}>{user?.uin}</Text>

      <Text style={styles.label}>Ник</Text>
      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />

      <Text style={styles.label}>Имя</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />

      <Text style={styles.label}>Фамилия</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />

      <Text style={styles.label}>Местоимения</Text>
      <TextInput style={styles.input} value={pronouns} onChangeText={setPronouns} placeholder="она / он / они" />

      <Text style={styles.label}>Дата рождения</Text>
      <View style={styles.birthdayRow}>
        <TextInput
          style={[styles.input, styles.birthdayInputSmall]}
          value={birthdayDay}
          onChangeText={(t) => setBirthdayDay(t.replace(/[^0-9]/g, "").slice(0, 2))}
          placeholder="ДД"
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={styles.birthdaySeparator}>.</Text>
        <TextInput
          style={[styles.input, styles.birthdayInputSmall]}
          value={birthdayMonth}
          onChangeText={(t) => setBirthdayMonth(t.replace(/[^0-9]/g, "").slice(0, 2))}
          placeholder="ММ"
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={styles.birthdaySeparator}>.</Text>
        <TextInput
          style={[styles.input, styles.birthdayInputYear]}
          value={birthdayYear}
          onChangeText={(t) => setBirthdayYear(t.replace(/[^0-9]/g, "").slice(0, 4))}
          placeholder="ГГГГ или ГГ"
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>
      <Text style={styles.hint}>Год можно указать двумя цифрами (91) или четырьмя (1991)</Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Показывать год рождения в профиле</Text>
        <Switch value={birthdayShowYear} onValueChange={setBirthdayShowYear} />
      </View>

      <Text style={styles.label}>Город</Text>
      <TextInput style={styles.input} value={city} onChangeText={setCity} />

      <Text style={styles.label}>Страна</Text>
      <TextInput style={styles.input} value={country} onChangeText={setCountry} />

      <Text style={styles.label}>Языки</Text>
      <TextInput
        style={styles.input}
        value={languages}
        onChangeText={setLanguages}
        placeholder="русский, английский"
      />

      <Text style={styles.label}>Занятие</Text>
      <TextInput style={styles.input} value={occupation} onChangeText={setOccupation} />

      <Text style={styles.label}>Интересы</Text>
      <TextInput
        style={styles.input}
        value={interests}
        onChangeText={setInterests}
        placeholder="книги, кофе, старые фотоаппараты"
      />

      <Text style={styles.label}>О себе</Text>
      <TextInput
        style={[styles.input, styles.aboutInput]}
        value={about}
        onChangeText={setAbout}
        placeholder="Пара слов о себе"
        multiline
        maxLength={500}
      />

      <Text style={styles.label}>Сайт</Text>
      <TextInput
        style={styles.input}
        value={website}
        onChangeText={setWebsite}
        autoCapitalize="none"
        placeholder="https://…"
      />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Показывать email в профиле</Text>
        <Switch value={emailPublic} onValueChange={setEmailPublic} />
      </View>

      <Text style={styles.label}>Телефон</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Показывать телефон в профиле</Text>
        <Switch value={phonePublic} onValueChange={setPhonePublic} />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleSave} disabled={isSaving || !displayName.trim()}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Сохранить</Text>}
      </Pressable>

      <Pressable
        style={styles.wipeButton}
        onPress={() =>
          Alert.alert(
            "Очистить локальные данные?",
            "Удалится история сообщений и кэш фото, сохранённые на этом устройстве. На сервере ничего не изменится. Полезно, если бэкенд недавно пересоздавали с нуля.",
            [
              { text: "Отмена", style: "cancel" },
              {
                text: "Очистить",
                style: "destructive",
                onPress: async () => {
                  await wipeLocalData();
                  Alert.alert("Готово", "Локальные данные на этом устройстве очищены.");
                },
              },
            ]
          )
        }
      >
        <Text style={styles.wipeButtonText}>Очистить локальные данные на этом устройстве</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 40 },
  avatarWrap: { alignSelf: "center", marginBottom: 8 },
  // Square with slightly rounded corners — classic ICQ buddy icon, not a
  // WhatsApp/Telegram-style circle.
  avatar: { width: 100, height: 100, borderRadius: 14 },
  avatarPlaceholder: { backgroundColor: "#e9ecef", alignItems: "center", justifyContent: "center" },
  avatarHint: { fontSize: 12, color: "#868e96", textAlign: "center", paddingHorizontal: 8 },
  label: { fontSize: 13, fontWeight: "700", color: "#868e96", textTransform: "uppercase", marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    fontSize: 16,
  },
  aboutInput: { minHeight: 80, textAlignVertical: "top" },
  uinValue: { fontSize: 22, fontWeight: "700", marginTop: 4 },
  birthdayRow: { flexDirection: "row", alignItems: "center" },
  birthdayInputSmall: { width: 56, textAlign: "center" },
  birthdayInputYear: { width: 90, textAlign: "center" },
  birthdaySeparator: { fontSize: 18, marginHorizontal: 4, marginTop: 8, color: "#868e96" },
  hint: { fontSize: 12, color: "#868e96", marginTop: 6 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  switchLabel: { fontSize: 14, color: "#495057", flex: 1, marginRight: 8 },
  error: { color: "#c92a2a", marginTop: 16, textAlign: "center" },
  button: {
    backgroundColor: "#2f9e44",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  wipeButton: { alignItems: "center", marginTop: 16, padding: 8 },
  wipeButtonText: { color: "#c92a2a", fontSize: 13, textAlign: "center" },
});
