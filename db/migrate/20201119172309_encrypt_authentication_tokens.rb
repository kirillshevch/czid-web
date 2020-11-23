class EncryptAuthenticationTokens < ActiveRecord::Migration[5.2]
  def up
    add_column :users, :authentication_token_encrypted, :binary, limit: 48, unique: true
    User.all.each do |user|
      if user.authentication_token_encrypted
        user.authentication_token_encrypted = User.encrypt_token(user.authentication_token)
      end
    end
    remove_column :users, :authentication_token
  end

  def down
    add_column :users, :authentication_token, :string, unique: true
    User.all.each do |user|
      if user.authentication_token
        user.authentication_token = User.decrypt_token(user.authentication_token_encrypted)
      end
    end
    remove_column :users, :authentication_token_encrypted
  end
end
